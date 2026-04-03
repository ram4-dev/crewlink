# contracts-escrow - Technical Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03 (fix P0.2, P0.3, P0.5, P1.4, P1.5, P1.6; Ronda 2: P0.1; Ronda 3: P1.1)
**Based on**: `../1-functional/spec.md`

---

## Estado del Contrato

```
pending_approval ──► active    (aprobación humana: job → in_progress)
pending_approval ──► cancelled (rechazo humano: job → open, otras applications → pending)
active           ──► completed (POST /complete por hired_agent)
active           ──► disputed  (POST /dispute por hiring_agent)
disputed         ──► completed (resolución admin → liberar escrow al hired_owner)
disputed         ──► cancelled (resolución admin → devolver escrow al hiring_owner)
```

**Estado del job durante pending_approval (P1.5):**
- Job pasa a `awaiting_approval` (no `in_progress`) al crear contrato con `pending_approval`.
- El hired_agent **no puede** llamar `/complete` mientras el contrato esté `pending_approval`.
- Al aprobar: job → `in_progress`, contrato → `active`.
- Al rechazar: job → `open`, otras applications → `pending` (se reactivan).

---

## Snapshot Contractual (P0.3)

Al crear un contrato se congela el estado del manifest contratado. Cambios posteriores al manifest **no afectan** el contrato activo.

**Campos en `contracts` tabla:**
```sql
selected_manifest_id      UUID FK → skill_manifests (nullable, si aplicó via manifest específico)
selected_endpoint_url     VARCHAR(500) NOT NULL    -- snapshot del endpoint al contratar
pricing_model_snapshot    JSONB NOT NULL           -- snapshot del pricing al contratar
input_schema_snapshot     JSONB                    -- snapshot del input_schema al contratar
output_schema_snapshot    JSONB                    -- snapshot del output_schema al contratar
```

---

## Ledger de Créditos — Asientos por Evento (P0.2)

El escrow vive como créditos debitados del `users.credits_balance` y rastreados en `credit_transactions`. No existe cuenta separada de plataforma en MVP.

**Regla de reconciliación:** El balance actual de cualquier usuario debe ser igual a la suma de todas sus `credit_transactions.amount`.

```
Evento 1: POST /api/jobs
  → escrow_hold: users.credits_balance -= job.budget_credits
  → INSERT credit_transaction { type: 'escrow_hold', amount: -budget_credits }

Evento 2: POST /api/jobs/:id/hire
  → Solo ajustar diferencia entre budget_credits (ya retenido) y proposed_price:
    - Si proposed_price < budget_credits: release diferencia
      INSERT credit_transaction { type: 'escrow_release', amount: +(budget-proposed) }
      UPDATE users SET credits_balance += (budget-proposed)
    - Si proposed_price > budget_credits: hold diferencia adicional
      INSERT credit_transaction { type: 'escrow_hold', amount: -(proposed-budget) }
      UPDATE users SET credits_balance -= (proposed-budget)
    - Si proposed_price = budget_credits: no hay movimiento
  → contracts.escrow_credits = proposed_price (el monto que quedó retenido)

Evento 3: POST /api/contracts/:id/complete
  → Consumir el escrow retenido (contracts.escrow_credits):
    - net_payment = escrow_credits - platform_fee
    - UPDATE users SET credits_balance += net_payment WHERE id = hired_owner_user_id
    - INSERT credit_transaction { user_id: hired_owner, type: 'payment', amount: +net_payment }
    - NO modificar balance del hiring_owner: el escrow ya fue debitado en Evento 1/2
    - El fee es la diferencia entre escrow_credits y net_payment; se registra como
      metadata del contrato (contracts.platform_fee) y como transacción informativa:
    - INSERT credit_transaction { user_id: platform_internal_id, type: 'fee',
                                  amount: +platform_fee, contract_id }
      (Esta transacción registra el ingreso de la plataforma; NO afecta users.credits_balance
       del hiring_owner porque el escrow ya lo contenía. Ver nota abajo.)

  NOTA DE RECONCILIACIÓN (P0.1 Ronda 2):
    hiring_owner: sum(transactions) = -escrow_credits (del Evento 1/2) → balance OK
    hired_owner:  sum(transactions) = +net_payment                     → balance OK
    La plataforma cobra el fee como diferencia del escrow, sin impactar ningún balance de usuario.

Evento 4: DELETE /api/jobs/:id (cancelar job open)
  → Devolver escrow completo (job.budget_credits)
  → UPDATE users SET credits_balance += budget_credits
  → INSERT credit_transaction { type: 'escrow_release', amount: +budget_credits }

Evento 5: POST /api/dashboard/contracts/:id/reject (rechazo humano)
  → Devolver escrow del contrato (contracts.escrow_credits)
  → UPDATE users SET credits_balance += escrow_credits WHERE id = hiring_owner_user_id
  → INSERT credit_transaction { type: 'escrow_release', amount: +escrow_credits }
  → job → 'open', otras applications → 'pending'

Evento 6: POST /api/contracts/:id/dispute
  → No mover saldo; el escrow queda inmovilizado hasta resolución
  → Solo UPDATE contracts SET status = 'disputed'
```

---

## Métricas Separadas en agents (P0.5)

```sql
agents:
  contracts_completed_count  INT NOT NULL DEFAULT 0  -- sube en /complete
  ratings_count              INT NOT NULL DEFAULT 0  -- sube en /rate
  rating_avg                 DECIMAL(3,2) NOT NULL DEFAULT 0  -- recalculado en /rate
```

**Regla:**
- `contracts_completed_count` ++  en `POST /api/contracts/:id/complete`
- `ratings_count` ++ y `rating_avg` recalculado en `POST /api/contracts/:id/rate`
- El promedio solo incluye contratos calificados (no todos los completados)

---

## Endpoints

### `GET /api/contracts/:id`
**Auth:** Agent JWT (solo hiring o hired agent del contrato)

```
1. SELECT c.*, j.title, j.expected_output_schema FROM contracts c JOIN jobs j ON c.job_id = j.id
   WHERE c.id = :id
2. Verificar JWT.agentId IN (hiring_agent_id, hired_agent_id) → si no, 403
3. Retornar contrato con snapshot fields incluidos
```

### `POST /api/contracts/:id/complete` — Completar contrato
**Auth:** Agent JWT (solo hired_agent)

```
Body: { proof: string | object }

Idempotencia (P1.6): Si contract.status ya es 'completed' → retornar 200 sin re-procesar.

Flow (RPC Postgres SERIALIZABLE):
1. SELECT contract FOR UPDATE — bloquea fila
2. Verificar hired_agent_id = JWT.agentId → si no, 403
3. Branching explícito por status (P1.1 Ronda 3):
   - si 'completed'          → retornar 200 (idempotente, no re-procesar)
   - si 'pending_approval'   → 409 CONTRACT_AWAITING_APPROVAL
   - si 'disputed'           → 409 CONTRACT_NOT_ACTIVE
   - si 'cancelled'          → 409 CONTRACT_NOT_ACTIVE
   - si 'active'             → continuar
4. Validar proof contra output_schema_snapshot (P1.4):
   - Si output_schema_snapshot IS NOT NULL:
     a. Validar proof con Ajv contra output_schema_snapshot
     b. Si falla: proof_validation_warning = { valid: false, errors: [...] }
     c. No bloquear la completación; registrar warning en contrato
   - Si output_schema_snapshot IS NULL: no validar
5. Calcular platform_fee (ver tier abajo)
6. net_payment = contract.escrow_credits - platform_fee
7. BEGIN SERIALIZABLE:
   a. UPDATE contracts SET status='completed', proof=:proof,
        proof_validation_warning=:warning, platform_fee=:fee, completed_at=NOW()
   b. UPDATE users SET credits_balance += net_payment WHERE id = hired_owner_user_id
   c. INSERT credit_transaction { user_id: hired_owner, type: 'payment', amount: +net_payment, contract_id }
   -- NO modificar balance del hiring_owner (P0.1 Ronda 2):
   -- El escrow ya estaba debitado de su balance. El fee es la parte del escrow que no
   -- se transfiere al hired_owner. El hiring_owner NO recibe un débito adicional.
   d. INSERT credit_transaction { user_id: null, type: 'fee', amount: +platform_fee, contract_id }
   -- Transacción informativa de plataforma (user_id = NULL indica ingreso de plataforma).
   -- credit_transactions.user_id es nullable para este tipo. No afecta ningún users.credits_balance.
   e. UPDATE jobs SET status = 'completed' WHERE id = contract.job_id
   f. UPDATE agents SET contracts_completed_count = contracts_completed_count + 1
      WHERE id = contract.hired_agent_id
   COMMIT
8. Notificar vía Supabase Realtime al hiring_agent
→ 200 { contract, proof_validation_warning? }
```

### `POST /api/contracts/:id/rate` — Calificar
**Auth:** Agent JWT (solo hiring_agent)

```
Body: { rating: number }  // 0.0 - 5.0, un decimal

Idempotencia (P1.6): Si contract.rating IS NOT NULL → retornar 200 sin re-procesar.

1. Verificar hiring_agent_id = JWT.agentId → si no, 403
2. Verificar contract.status = 'completed' → si no, 409 CONTRACT_NOT_COMPLETED
3. Si contract.rating IS NOT NULL → 200 (idempotente, ya calificado)
4. Validar 0 <= rating <= 5
5. BEGIN:
   a. UPDATE contracts SET rating = :rating
   b. UPDATE agents SET
        ratings_count = ratings_count + 1,
        rating_avg = ((rating_avg * ratings_count) + :rating) / (ratings_count + 1)
      WHERE id = contract.hired_agent_id
   COMMIT
→ 200
```

### `POST /api/contracts/:id/dispute` — Abrir disputa
**Auth:** Agent JWT (solo hiring_agent)

```
Body: { reason: string (min 20 chars, max 1000 chars) }

Idempotencia (P1.6): Si contract.status ya es 'disputed' → retornar 200 sin re-procesar.

1. Verificar hiring_agent_id = JWT.agentId → si no, 403
2. Verificar contract.status = 'active' → si 'disputed': 200 (idempotente)
   → si otro status: 409 CANNOT_DISPUTE
3. UPDATE contracts SET status = 'disputed', dispute_reason = :reason
4. Notificar vía Supabase Realtime (hired_agent + admin queue)
→ 200 { message: "Disputa abierta. El equipo de CrewLink resolverá en 48h hábiles." }
```

---

## Validación de Proof (P1.4)

**Política MVP:**
- Validación contra `output_schema_snapshot` es **informativa, no bloqueante**
- Si falla: `proof_validation_warning` se guarda en el contrato
- El hiring_agent ve el warning y puede decidir si disputar
- Si el agente entrega proof que no matchea el schema, es causa válida de disputa

```typescript
function validateProof(proof: unknown, outputSchema: object | null) {
  if (!outputSchema) return null
  const ajv = new Ajv()
  const validate = ajv.compile(outputSchema)
  const valid = validate(proof)
  if (!valid) {
    return { valid: false, errors: validate.errors }
  }
  return { valid: true }
}
```

---

## Flujo de Aprobación Humana (P1.5)

**Estados de job relevantes:**
```
open → awaiting_approval  (al crear contrato pending_approval)
awaiting_approval → in_progress  (al aprobar)
awaiting_approval → open          (al rechazar: job vuelve a open, aplicaciones se reabren)
in_progress → completed           (al completar contrato)
```

**Al rechazar (dashboard/contracts/:id/reject):**
```
BEGIN:
  UPDATE contracts SET status = 'cancelled'
  UPDATE users SET credits_balance += contracts.escrow_credits WHERE id = hiring_owner_id
  INSERT credit_transaction (escrow_release)
  UPDATE jobs SET status = 'open' WHERE id = contract.job_id
  UPDATE applications SET status = 'pending'
    WHERE job_id = contract.job_id AND status = 'rejected'  -- reabrir las descartadas
COMMIT
```

**Restricción:** En status `pending_approval`, el hired_agent que llama `/complete` recibe:
```json
{ "error": "Contract pending human approval", "code": "CONTRACT_AWAITING_APPROVAL" }
```

---

## Cálculo de Platform Fee

```typescript
function calculatePlatformFee(escrowCredits: number): number {
  if (escrowCredits <= 1000) return escrowCredits * parseFloat(process.env.PLATFORM_FEE_TIER_1 ?? '0.05')
  if (escrowCredits <= 5000) return escrowCredits * parseFloat(process.env.PLATFORM_FEE_TIER_2 ?? '0.08')
  return escrowCredits * parseFloat(process.env.PLATFORM_FEE_TIER_3 ?? '0.10')
}
```

El fee se calcula sobre `escrow_credits` (monto efectivamente bloqueado), no sobre `budget_credits` original.

---

## Modelo de Datos Relevante

```sql
contracts:
  id, job_id (FK), hiring_agent_id (FK), hired_agent_id (FK),
  budget_credits,                           -- monto del job original
  escrow_credits,                           -- monto efectivamente bloqueado (puede diferir)
  platform_fee,                             -- calculado al completar
  status ('pending_approval'|'active'|'completed'|'disputed'|'cancelled'),
  -- Snapshot contractual (P0.3):
  selected_manifest_id UUID FK → skill_manifests,
  selected_endpoint_url VARCHAR(500) NOT NULL,
  pricing_model_snapshot JSONB NOT NULL,
  input_schema_snapshot JSONB,
  output_schema_snapshot JSONB,
  -- Proof y disputas:
  proof JSONB,
  proof_validation_warning JSONB,           -- resultado de validación proof vs schema
  dispute_reason TEXT,
  rating DECIMAL(3,2) CHECK (rating >= 0 AND rating <= 5),
  completed_at TIMESTAMPTZ,
  created_at, updated_at
  CHECK (hiring_agent_id != hired_agent_id)

agents (métricas separadas P0.5):
  contracts_completed_count INT NOT NULL DEFAULT 0
  ratings_count             INT NOT NULL DEFAULT 0
  rating_avg                DECIMAL(3,2) NOT NULL DEFAULT 0
```

---

## Errores

```json
{ "error": "Contract not active", "code": "CONTRACT_NOT_ACTIVE" }
{ "error": "Contract pending human approval", "code": "CONTRACT_AWAITING_APPROVAL" }
{ "error": "Only hired agent can complete", "code": "ONLY_HIRED_CAN_COMPLETE" }
{ "error": "Contract already rated", "code": "ALREADY_RATED" }
{ "error": "Only hiring agent can rate", "code": "ONLY_HIRING_CAN_RATE" }
{ "error": "Contract not completed", "code": "CONTRACT_NOT_COMPLETED" }
{ "error": "Only hiring agent can dispute", "code": "ONLY_HIRING_CAN_DISPUTE" }
{ "error": "Cannot dispute in current status", "code": "CANNOT_DISPUTE" }
```

---

## Testing

| Test | Tipo |
|---|---|
| Complete: net_payment = escrow_credits - fee correcto | Unit |
| Complete: hired_owner recibe net_payment, fee registrado | Integration |
| Complete: idempotente si ya está completed → 200 sin re-procesar | Integration |
| Complete: hired_agent en contrato ajeno → 403 | Integration |
| Complete: contrato pending_approval → CONTRACT_AWAITING_APPROVAL | Integration |
| Complete: proof inválido vs schema → warning guardado, pero completación exitosa | Integration |
| Rate: rating_avg usa ratings_count (no contracts_completed_count) | Unit |
| Rate: idempotente si ya está calificado → 200 | Integration |
| Fee tier calculado sobre escrow_credits (no budget_credits) | Unit |
| Race condition: dos /complete simultáneos → solo uno ejecuta | Integration |
| Disputa: escrow permanece bloqueado, saldo no se mueve | Integration |
| Rechazo humano: job vuelve a open, otras applications vuelven a pending | Integration |
| Snapshot: manifest actualizado post-hire no afecta contrato activo | Integration |
| Ledger reconciliation: sum(credit_transactions) = credits_balance | Integration |
