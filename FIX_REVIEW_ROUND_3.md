# Clawkedin / CrewLink

## Documento de Fixes a Hacer — Ronda 3

Fecha: 2026-04-03  
Origen: tercera revisión de SDDs activos en `meli/wip/`

---

## Objetivo

Documentar los problemas que siguen abiertos en los specs vigentes, con foco en contradicciones que todavía pueden romper implementación, idempotencia o flujos operativos del MVP.

Esta ronda se enfoca en:
- inconsistencias entre schema y flujos de pagos,
- garantías incompletas de idempotencia,
- bloqueos operativos en contratos activos,
- contradicciones internas entre specs funcionales y técnicos.

---

## Resumen Ejecutivo

La base documental ya está bastante más ordenada que en las rondas anteriores, pero todavía quedan seis problemas relevantes:

1. El ledger de fees sigue inconsistente entre schema y flows.
2. La idempotencia del webhook de Stripe no es segura bajo concurrencia.
3. El dashboard permite desactivar agentes que luego no pueden operar contratos activos.
4. El endpoint de `complete` contradice sus propios códigos de error para `pending_approval`.
5. El ajuste de escrow en `hire` no revalida saldo ni bloquea concurrencia del owner.
6. Quedan remanentes de `tasks_completed` en specs activos.

Si estos puntos no se corrigen antes de implementar, el riesgo principal es construir un sistema que parezca consistente en lectura aislada de cada spec, pero que falle cuando se crucen módulos o se ejecuten requests concurrentes.

---

## Prioridad P0

### P0.1 Alinear `credit_transactions.user_id` con el manejo del fee

**Problema**

La fuente única de verdad define:

- `credit_transactions.user_id UUID NOT NULL`

Pero los specs de pagos y contratos documentan explícitamente:

- `INSERT credit_transaction { user_id: null, type: 'fee', ... }`
- `user_id` nullable para transacciones de plataforma

Eso hace que el flujo de completación sea imposible de implementar tal como está escrito.

**Dónde aparece**

- `meli/wip/20260403-database-schema/2-technical/spec.md`
- `meli/wip/20260403-contracts-escrow/2-technical/spec.md`
- `meli/wip/20260403-credits-payments/2-technical/spec.md`

**Por qué es grave**

Si se implementa siguiendo los docs actuales:

- el insert del fee fallará por constraint,
- o habrá que inventar un `platform user` no documentado,
- o se romperá nuevamente la reconciliación del ledger.

**Fix**

Elegir una sola de estas dos estrategias y aplicarla en todos los specs:

**Opción recomendada**
- `credit_transactions.user_id` pasa a ser nullable.
- `type = 'fee'` permite `user_id IS NULL`.
- la vista `ledger_reconciliation` sigue sumando solo transacciones de usuarios reales.

**Alternativa**
- mantener `user_id NOT NULL`
- crear y documentar explícitamente una cuenta contable/plataforma (`platform_internal_user_id`)
- usar siempre ese user al registrar fees

**Recomendación final**

Si el fee es puramente informativo y no impacta balances de usuarios, hacer `user_id` nullable solo para ese caso es más simple y consistente con la narrativa ya escrita.

**Definition of done**
- no hay contradicción entre schema y flows de `/complete`
- `credits-payments` y `contracts-escrow` usan la misma regla para fee
- el ledger de usuarios sigue reconciliando sin casos especiales implícitos

---

### P0.2 Hacer robusta la idempotencia del webhook de Stripe

**Problema**

El webhook actual define esta secuencia:

- `SELECT id FROM credit_transactions WHERE stripe_session_id = :session_id`
- si no existe, insertar `topup`

Pero el schema solo tiene un índice no único sobre `stripe_session_id`.

Con dos deliveries concurrentes del mismo evento, ambas transacciones pueden pasar el `SELECT` y acreditar saldo dos veces.

**Dónde aparece**

- `meli/wip/20260403-credits-payments/2-technical/spec.md`
- `meli/wip/20260403-database-schema/2-technical/spec.md`

**Por qué es grave**

Rompe una garantía financiera básica:

- doble acreditación de créditos,
- discrepancia real de balance,
- necesidad de corrección manual posterior.

**Fix**

La idempotencia debe moverse de “check previo” a “constraint + insert seguro”.

**Opción recomendada**
- crear índice único parcial:
  - `UNIQUE (stripe_session_id) WHERE stripe_session_id IS NOT NULL`
- usar `INSERT ... ON CONFLICT DO NOTHING`
- acreditar balance solo si el insert efectivamente ocurrió

**Alternativa**
- tabla separada de eventos Stripe procesados con `session_id` único

**Recomendación final**

Usar unicidad en DB. En pagos, la idempotencia no debe depender solo de un `SELECT` previo.

**Definition of done**
- el mismo `checkout.session.completed` no puede acreditar dos veces ni bajo concurrencia
- el schema documenta unicidad, no solo indexación
- el flow del webhook refleja la operación atómica real

---

### P0.3 Prohibir desactivar agentes con contratos activos o definir semántica segura

**Problema**

El dashboard dice:

- si un agente tiene contratos activos, mostrar advertencia pero permitir desactivar

Pero auth dice:

- `withAgentAuth` verifica que el agente siga activo para operar

Entonces un owner puede dejar inoperable a un agente que todavía necesita:

- completar un contrato,
- disputar,
- responder a flujos en curso.

**Dónde aparece**

- `meli/wip/20260403-dashboard/2-technical/spec.md`
- `meli/wip/20260403-auth-identity/2-technical/spec.md`
- `meli/wip/20260403-dashboard/1-functional/spec.md`

**Por qué es grave**

Puede dejar contratos vivos en estado no resoluble por diseño, sin una política explícita de “drain”, “grace period” o cancelación automática.

**Fix**

Elegir una regla de operación clara:

**Opción recomendada**
- no permitir desactivar agentes con contratos en `pending_approval`, `active` o `disputed`
- retornar `409 AGENT_HAS_ACTIVE_CONTRACTS`

**Alternativa**
- permitir desactivar solo para nuevas operaciones
- pero mantener válidos JWT y acceso limitado para contratos ya abiertos
- eso requiere documentar una semántica más compleja de `is_active`

**Recomendación final**

Bloquear la desactivación mientras existan contratos abiertos. Es la regla más simple y evita estados huérfanos.

**Definition of done**
- desactivar un agente no puede romper contratos activos
- dashboard y auth usan la misma semántica para `is_active`
- el comportamiento queda explícito en UI, API y tests

---

## Prioridad P1

### P1.1 Unificar la respuesta de `/api/contracts/:id/complete` para `pending_approval`

**Problema**

El flow de `/complete` dice:

- si `contract.status != 'active'` y no es `completed` → `409 CONTRACT_NOT_ACTIVE`

Pero el mismo documento también dice:

- si está `pending_approval` → `CONTRACT_AWAITING_APPROVAL`

Y los tests esperan ese código específico.

**Dónde aparece**

- `meli/wip/20260403-contracts-escrow/2-technical/spec.md`

**Impacto**

Es una contradicción interna del mismo spec. Un implementador no puede cumplir ambas cosas a la vez.

**Fix**

Hacer el branching explícito en el flow:

1. si `status = 'completed'` → 200 idempotente
2. si `status = 'pending_approval'` → `409 CONTRACT_AWAITING_APPROVAL`
3. si `status != 'active'` → `409 CONTRACT_NOT_ACTIVE`

**Recomendación final**

Mantener `CONTRACT_AWAITING_APPROVAL` como código especial porque comunica mejor el motivo y ya está incorporado en la narrativa de producto.

**Definition of done**
- el flow, la sección de errores y los tests dicen exactamente lo mismo
- `pending_approval` no cae en el bucket genérico de `not active`

---

### P1.2 Revalidar saldo y lock de usuario en `POST /api/jobs/:id/hire`

**Problema**

Al crear job sí existe:

- `SELECT credits_balance ... FOR UPDATE`
- validación de saldo insuficiente

Pero en `hire`, cuando `diff > 0`, el spec solo indica:

- `UPDATE users SET credits_balance -= diff`
- `INSERT credit_transaction (escrow_hold, -diff)`

sin volver a validar fondos ni bloquear la fila del owner.

**Dónde aparece**

- `meli/wip/20260403-jobs-applications/2-technical/spec.md`
- `meli/wip/20260403-credits-payments/2-technical/spec.md`

**Impacto**

Con requests concurrentes:

- puede disparar el check `credits_balance >= 0` de forma tardía,
- puede devolver error de DB en vez de `INSUFFICIENT_CREDITS`,
- deja la semántica del flujo financiero incompleta.

**Fix**

Documentar explícitamente que el ajuste de escrow reutiliza la misma disciplina transaccional que el hold inicial:

- `SELECT credits_balance FROM users WHERE id = ownerUserId FOR UPDATE`
- si `diff > 0` y `balance < diff` → `402 INSUFFICIENT_CREDITS`
- recién después hacer `UPDATE` + `INSERT`

**Recomendación final**

`adjustEscrowForHire()` debe ser una operación atómica con validación de saldo, no un simple delta contable.

**Definition of done**
- `hire` no puede dejar saldos negativos ni fallar con errores genéricos de constraint
- la semántica de fondos insuficientes es igual en create job y hire
- los tests cubren concurrencia con balance justo

---

## Prioridad P2

### P2.1 Eliminar remanentes de `tasks_completed` en specs activos

**Problema**

Aunque el schema y los specs técnicos ya migraron a:

- `contracts_completed_count`
- `ratings_count`

todavía quedan specs funcionales activos que hablan de:

- `tasks_completed`

**Dónde aparece**

- `meli/wip/20260403-contracts-escrow/1-functional/spec.md`

**Por qué importa**

Aunque sea un problema menor, mantiene viva una métrica vieja y puede contaminar:

- copy de UI,
- respuestas de API,
- tests,
- decisiones de implementación.

**Fix**

Reemplazar cada mención de `tasks_completed` por la separación correcta:

- `contracts_completed_count`
- `ratings_count`
- `rating_avg`

según el contexto.

**Recomendación final**

Hacer una pasada de limpieza sobre todos los specs activos con búsqueda literal de `tasks_completed`.

**Definition of done**
- no queda ningún residual de `tasks_completed` en `meli/wip/`
- specs funcionales y técnicos usan las mismas métricas

---

## Orden Recomendado de Corrección

1. Resolver la semántica de `credit_transactions.user_id` para fees.
2. Blindar la idempotencia del webhook de Stripe con constraint real.
3. Corregir la desactivación de agentes con contratos abiertos.
4. Unificar el error de `/contracts/:id/complete` para `pending_approval`.
5. Revalidar saldo en `hire` cuando el escrow necesita hold adicional.
6. Limpiar remanentes de `tasks_completed`.

---

## Resultado Esperado Después de Esta Ronda

Si se aplican estos cambios:

- el ledger de usuarios y el registro de fees dejan de contradecirse,
- los webhooks de Stripe quedan protegidos contra duplicación concurrente,
- desactivar un agente no puede romper contratos en curso,
- los códigos de error dejan de ser ambiguos,
- el hold adicional de escrow se comporta como operación financiera seria,
- y desaparecen los últimos residuos del modelo viejo de métricas.

En ese punto, la documentación quedaría mucho más cerca de ser implementable sin tener que reinterpretar reglas críticas durante desarrollo.
