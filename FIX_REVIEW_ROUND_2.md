# Clawkedin / CrewLink

## Documento de Fixes a Hacer — Ronda 2

Fecha: 2026-04-03  
Origen: segunda revisión de SDDs luego de aplicar fixes previos

---

## Objetivo

Documentar los problemas que siguen abiertos después de los fixes ya incorporados en `meli/wip/`, y dejar propuestas concretas para cerrar la documentación antes de implementación.

Esta ronda se enfoca en:
- inconsistencias remanentes en ledger y pagos,
- referencias a campos inexistentes,
- desalineación entre módulos,
- coexistencia de documentos viejos y nuevos con reglas distintas.

---

## Resumen Ejecutivo

Se corrigieron varios puntos importantes:
- identidad humana con `users.id` interno + `clerk_user_id`,
- snapshot contractual,
- separación entre `contracts_completed_count` y `ratings_count`,
- estado `awaiting_approval`,
- validación no bloqueante de `proof`,
- full-text search en español,
- `jobs.tags`.

Sin embargo, todavía quedan abiertos cuatro focos relevantes:

1. El ledger financiero todavía no reconcilia correctamente.
2. El flujo de hire depende de un campo inexistente (`default_endpoint`).
3. El módulo `credits-payments` no quedó alineado con la nueva fuente de verdad.
4. Los SDDs viejos de `sdds/` contradicen la documentación nueva.

---

## Prioridad P0

### P0.1 Corregir reconciliación del ledger

**Problema**

La documentación nueva define esta regla:

- `sum(credit_transactions.amount) = users.credits_balance`

Pero en el flujo de `POST /api/contracts/:id/complete`:
- se acredita `payment` al owner del agente contratado,
- se registra `fee` negativo para el `hiring_owner`,
- pero no se debita `users.credits_balance` del `hiring_owner` en ese momento.

Eso rompe la reconciliación.

**Dónde aparece**

- `meli/wip/20260403-contracts-escrow/2-technical/spec.md`
- `meli/wip/20260403-database-schema/2-technical/spec.md`

**Por qué es grave**

Si se implementa así:
- el ledger no va a cerrar,
- la vista `ledger_reconciliation` va a reportar discrepancias reales,
- el modelo financiero pierde confiabilidad.

**Fix**

Elegir una sola interpretación correcta del fee:

**Opción recomendada**
- El fee no debe registrarse como un nuevo gasto adicional del `hiring_owner`.
- El fee debe modelarse como parte del escrow ya retenido.
- Al completar:
  - el `hiring_owner` no cambia balance,
  - el `hired_owner` recibe `payment = escrow_credits - fee`,
  - el fee queda solo como metadata del contrato o como transacción de plataforma no imputada al user balance.

**Alternativa**
- Si se quiere mantener `credit_transaction(type='fee', amount=-platform_fee, user_id=hiring_owner)`,
  entonces también hay que hacer:
  - `UPDATE users SET credits_balance -= platform_fee WHERE id = hiring_owner_id`

Pero eso generaría doble cobro respecto del escrow ya retenido, salvo que se rediseñe todo el flujo.

**Recomendación final**

No debitar fee adicional al `hiring_owner`.  
Modelar el fee como:
- diferencia entre `escrow_credits` y `payment`,
- y opcionalmente registrar una transacción de plataforma separada que no impacte `users.credits_balance`.

**Definition of done**
- la vista de reconciliación no detecta discrepancias en casos normales
- todos los eventos financieros preservan la igualdad entre balance y ledger

---

### P0.2 Eliminar referencia a `applicant_agent.default_endpoint`

**Problema**

El spec de `jobs/:id/hire` usa este fallback:

- `selected_endpoint_url: manifest?.endpoint_url ?? applicant_agent.default_endpoint`

Pero `default_endpoint` no existe en ningún schema.

**Dónde aparece**

- `meli/wip/20260403-jobs-applications/2-technical/spec.md`

**Por qué es grave**

Es una dependencia a un campo fantasma.  
Si alguien implementa ese flujo, tiene que:
- inventar un campo no documentado, o
- tomar decisiones no especificadas.

**Fix**

Elegir una regla explícita:

**Opción recomendada**
- `manifest_id` pasa a ser obligatorio en `POST /api/jobs/:id/apply`
- por lo tanto todo contrato nace desde un manifest explícito
- `selected_endpoint_url` siempre sale de `skill_manifests.endpoint_url`

**Alternativa**
- definir un campo nuevo en `agents`, por ejemplo `default_endpoint_url`
- agregarlo a schema, validación y CRUD

**Recomendación final**

Hacer `manifest_id` obligatorio al aplicar.  
Es más consistente con la propuesta de valor del producto: contratar capabilities parseables, no perfiles ambiguos.

**Definition of done**
- ningún flujo contractual depende de campos no definidos
- `selected_endpoint_url` siempre es derivable de una fuente explícita

---

## Prioridad P1

### P1.1 Alinear `credits-payments` con la nueva fuente de verdad

**Problema**

El spec de `credits-payments` quedó viejo respecto del modelo nuevo.

Todavía:
- no incorpora `job_id` en `credit_transactions`,
- no muestra inserción de `stripe_session_id` al procesar webhook,
- no refleja el ledger actualizado basado en hold en `job create` y ajuste por diferencia en `hire`,
- mantiene helpers genéricos que ya no representan bien el flujo real.

**Dónde aparece**

- `meli/wip/20260403-credits-payments/2-technical/spec.md`

**Impacto**

Aunque `database-schema` ya sea la fuente única de verdad, este feature sigue empujando un modelo alternativo y puede generar implementación inconsistente.

**Fix**

Actualizar este spec para reflejar exactamente la fuente de verdad.

**Debe cambiarse**

1. En webhook Stripe:
- insertar `stripe_session_id` en `credit_transactions`

2. En modelo de datos:
- incluir `job_id`
- incluir `stripe_session_id`

3. En helpers internos:
- documentar helpers alineados al flujo real:
  - `holdJobEscrow(userId, jobId, amount)`
  - `adjustEscrowForHire(userId, jobId, contractId, diff)`
  - `settleCompletedContract(...)`
  - `releaseJobEscrow(...)`
  - `releaseContractEscrowOnReject(...)`

4. En narrative:
- referenciar explícitamente que la fuente única de verdad está en `database-schema`

**Definition of done**
- `credits-payments` no contradice `database-schema`
- webhook, topup y operaciones internas usan el mismo modelo contable

---

### P1.2 Corregir inconsistencia de endpoint rotate/regenerate en dashboard

**Problema**

El dashboard ya decidió renombrar:
- `/api/dashboard/api-key/rotate`

pero en estructura de carpetas todavía aparece:
- `api-key/regenerate/route.ts`

y los tests siguen hablando de “Regenerar API Key”.

**Dónde aparece**

- `meli/wip/20260403-dashboard/2-technical/spec.md`

**Fix**

Elegir un único naming y aplicarlo a todo el documento.

**Recomendación**

Usar definitivamente:
- endpoint: `/api/dashboard/api-key/rotate`
- label UI: `Rotar API Key`
- test names y estructura de carpetas alineados con `rotate`

**Definition of done**
- endpoint, file tree, copy y tests usan el mismo nombre

---

## Prioridad P2

### P2.1 Retirar o marcar como obsoletos los SDD base en `sdds/`

**Problema**

Los docs en `sdds/` siguen contradiciendo los fixes nuevos:
- no tienen `clerk_user_id`
- siguen usando `tasks_completed`
- no tienen snapshot contractual
- no tienen `awaiting_approval`
- no tienen `proof_validation_warning`
- no incluyen el schema actualizado de `credit_transactions`

**Por qué importa**

Hoy conviven dos fuentes:
- `meli/wip/20260403-database-schema/2-technical/spec.md` como “fuente única”
- `sdds/sdd-01-database-schema.md` con reglas viejas

Eso es peligroso para cualquiera que lea el repo por primera vez.

**Fix**

Elegir una estrategia documental:

**Opción recomendada**
- mantener `meli/wip/.../database-schema/2-technical/spec.md` como documento vigente,
- marcar `sdds/sdd-01-database-schema.md` y demás `sdds/*` como `deprecated` o `superseded`,
- agregar una nota al inicio redirigiendo a la nueva fuente.

**Alternativa**
- actualizar completamente los `sdds/` para que reflejen los mismos fixes.

**Recomendación final**

Si `meli/wip` ya es el flujo principal, marcar los `sdds/` viejos como reemplazados para evitar confusión.

**Definition of done**
- no existen dos documentos activos con reglas incompatibles
- cualquier lector del repo sabe cuál es la fuente vigente

---

### P2.2 Ajustar detalle menor en `GET /api/jobs/:id/applications`

**Problema**

El spec todavía dice que la respuesta incluye:
- `applicant_agent (nombre, rating, tasks_completed)`

pero la métrica correcta ya no es `tasks_completed`.

**Fix**

Actualizar esa respuesta a:
- `contracts_completed_count`
- `ratings_count`
- `rating_avg`

**Definition of done**
- no queda ningún residual de `tasks_completed` en specs activos

---

## Orden Recomendado de Corrección

1. Corregir ledger y regla del fee
2. Eliminar `default_endpoint` o volver obligatorio `manifest_id`
3. Alinear `credits-payments`
4. Limpiar dashboard `rotate/regenerate`
5. Marcar `sdds/` viejos como obsoletos
6. Limpiar remanentes de `tasks_completed`

---

## Resultado Esperado Después de Esta Ronda

Si se aplican estos cambios:

- el modelo financiero quedará internamente consistente,
- no habrá referencias a campos inexistentes,
- los módulos de pagos y contratos volverán a estar alineados,
- se eliminará la ambigüedad entre documentación vieja y nueva.

En ese punto, la documentación ya quedaría mucho más cerca de estar lista para implementación sin retrabajo fuerte.
