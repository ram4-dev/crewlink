# Spec de Remediación 01

## Financial Integrity

Fecha: 2026-04-03
Prioridad: P0
Ámbito: `credits-payments`, `contracts-escrow`, `jobs-applications`, `database-schema`, `dashboard`

---

## Problema

La implementación actual rompe dos garantías básicas del sistema:

1. el balance del usuario no siempre coincide con la suma de `credit_transactions`;
2. los cambios de estado del dominio y los movimientos de dinero no ocurren en una única unidad atómica.

Eso deja el sistema expuesto a:

- doble hold o release implícito,
- payouts ejecutados con contratos todavía `active`,
- refunds aplicados aunque el contrato no haya quedado `cancelled`,
- estados intermedios imposibles de reconciliar.

---

## Decisiones

### D1. El ledger es la fuente de verdad financiera

La regla obligatoria pasa a ser:

`users.credits_balance = SUM(credit_transactions.amount WHERE user_id = users.id)`

Toda operación que cambie `credits_balance` debe insertar su transacción correspondiente dentro de la misma transacción SQL.

### D2. El ajuste de escrow en hire mueve solo la diferencia

El evento `POST /api/jobs/:id/hire` no puede registrar:

- release del monto viejo completo, ni
- hold del monto nuevo completo.

Solo puede registrar uno de estos dos asientos:

- `escrow_hold = -diff` si `approved_price > budget_credits`
- `escrow_release = +abs(diff)` si `approved_price < budget_credits`
- sin movimiento si `diff = 0`

### D3. Complete y reject deben ser atómicos de extremo a extremo

Los siguientes flujos deben ejecutarse como una sola unidad transaccional:

- completar contrato,
- rechazar contrato pendiente de aprobación,
- webhook de Stripe.

No se admite:

- ejecutar primero RPC financiera y después updates de dominio fuera de esa transacción;
- ejecutar primero update de balance y después insertar transacción;
- recuperar de errores con deletes manuales fuera de la misma unidad atómica.

### D4. La atomicidad vive en Postgres

Los flujos sensibles deben moverse a RPCs o funciones SQL específicas, con responsabilidad completa sobre:

- validación de estado previo,
- actualización de saldo,
- inserción de ledger,
- transición de estado del dominio,
- idempotencia cuando aplique.

La capa Next.js solo orquesta validaciones de request, auth y mapeo de errores.

---

## Flujos obligatorios

### F1. `create_job_with_escrow`

Responsabilidades:

- validar saldo disponible con lock de fila;
- crear job;
- debitar balance;
- insertar `escrow_hold`;
- devolver `job_id`.

Requisito:

- si falla cualquier paso, no queda job creado ni ledger parcial.

### F2. `hire_application_with_escrow_adjustment`

Responsabilidades:

- validar ownership del poster;
- validar que el job siga `open`;
- validar que no exista contrato previo no cancelado;
- validar application pendiente;
- calcular `diff`;
- si `diff > 0`, revalidar saldo con lock de fila;
- crear contrato snapshot;
- ajustar escrow solo por la diferencia;
- mover job a `awaiting_approval` o `in_progress`;
- marcar application aceptada y rechazar las otras.

Requisito:

- si el contrato no quedó creado, no puede existir ajuste de escrow;
- si el ajuste falló, no puede quedar contrato creado.

### F3. `complete_contract_and_settle`

Responsabilidades:

- bloquear contrato;
- verificar branching por status:
  - `completed` => idempotente
  - `pending_approval` => `CONTRACT_AWAITING_APPROVAL`
  - cualquier estado distinto de `active` => `CONTRACT_NOT_ACTIVE`
- validar proof de forma informativa;
- calcular `platform_fee` y `net_payment`;
- actualizar contrato a `completed`;
- acreditar `payment` al owner del agente contratado;
- insertar `fee` con `user_id = NULL`;
- actualizar job a `completed`;
- incrementar `contracts_completed_count`.

Requisito:

- el payout no puede existir si el contrato no quedó `completed`.

### F4. `reject_pending_contract_and_release_escrow`

Responsabilidades:

- bloquear contrato;
- verificar `pending_approval`;
- devolver `escrow_release` al owner contratante;
- cancelar contrato;
- reabrir job;
- reactivar applications rechazadas.

Requisito:

- el refund no puede existir si el contrato no quedó `cancelled`.

### F5. `process_stripe_topup_once`

Responsabilidades:

- verificar firma;
- insertar `topup` con unicidad por `stripe_session_id`;
- acreditar balance solo si el insert ocurrió;
- retornar estado idempotente si el evento ya fue procesado.

Requisito:

- la operación debe ser atómica aun con deliveries concurrentes.

---

## Cambios de schema requeridos

### S1. Mantener unicidad parcial en `stripe_session_id`

Se confirma como obligatoria:

```sql
CREATE UNIQUE INDEX idx_credit_transactions_stripe_session_id
ON credit_transactions(stripe_session_id)
WHERE stripe_session_id IS NOT NULL;
```

### S2. Mantener `user_id NULL` permitido solo para `fee`

Se confirma como obligatoria la regla:

```sql
CHECK (user_id IS NOT NULL OR type = 'fee')
```

### S3. Agregar o reemplazar RPCs

La implementación final debe exponer, como mínimo:

- `create_job_with_escrow`
- `hire_application_with_adjustment`
- `complete_contract_and_settle`
- `reject_pending_contract_and_release`
- `process_stripe_topup_once`

No es obligatorio mantener los nombres actuales si el nuevo diseño es más seguro.

---

## Errores y contratos

Las RPCs deben mapear errores de dominio explícitos para evitar fallback genérico `500` donde hoy hay errores de negocio previstos.

Mínimos obligatorios:

- `INSUFFICIENT_CREDITS`
- `JOB_NOT_OPEN`
- `APPLICATION_NOT_FOUND`
- `CONTRACT_NOT_FOUND`
- `CONTRACT_AWAITING_APPROVAL`
- `CONTRACT_NOT_ACTIVE`
- `CONTRACT_NOT_PENDING`
- `TOPUP_ALREADY_PROCESSED`

---

## Observabilidad

Cada flujo exitoso debe emitir eventos auditables consistentes:

- `escrow_held`
- `escrow_released`
- `contract_created`
- `contract_completed`
- `contract_rejected`
- `credits_topped_up`

Cada rechazo de negocio en flujos financieros debe dejar evento con correlación:

- `owner_user_id`
- `job_id` cuando aplique
- `contract_id` cuando aplique

---

## Definition of Done

- ningún flujo financiero deja ledger parcial;
- `hire` registra solo la diferencia real;
- `complete` y `reject` son atómicos con dominio + saldo + ledger;
- el webhook Stripe no duplica crédito ni bajo concurrencia;
- la vista `ledger_reconciliation` queda vacía en todos los tests de integración;
- los specs activos de `credits-payments`, `contracts-escrow`, `jobs-applications` y `database-schema` quedan alineados con este documento.
