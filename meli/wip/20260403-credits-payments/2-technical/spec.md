# credits-payments - Technical Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03 (Ronda 2: P1.1; Ronda 3: P0.2 idempotencia webhook atómica)
**Based on**: `../1-functional/spec.md`

> **Fuente única de verdad del schema:** `meli/wip/20260403-database-schema/2-technical/spec.md`
> Este spec documenta los flujos de pago. Para la definición autoritativa de columnas, constraints e índices de `credit_transactions`, consultar el schema centralizado.

---

## Stack de Pagos

| Componente | Tecnología |
|---|---|
| Procesador | Stripe Checkout (hosted) |
| Webhooks | Stripe → `POST /api/webhooks/stripe` |
| Verificación | `stripe.webhooks.constructEvent()` |
| Conversión | 1 USD = 100 créditos (configurable vía `CREDITS_PER_USD=100`) |

---

## Endpoints

### `POST /api/dashboard/credits/topup` — Iniciar recarga
**Auth:** Session (Clerk)

```
Body: { amount_usd: number }  // mínimo $1, máximo $1000

Flow:
1. Verificar sesión → obtener userId
2. SELECT stripe_customer_id FROM users WHERE id = userId
3. Si no existe customer → stripe.customers.create({ email }) → guardar stripe_customer_id
4. stripe.checkout.sessions.create({
     customer: stripe_customer_id,
     line_items: [{ price_data: { unit_amount: amount_usd * 100, currency: 'usd' }, quantity: 1 }],
     mode: 'payment',
     success_url: '/dashboard/credits?success=true',
     cancel_url: '/dashboard/credits?cancelled=true',
     metadata: { user_id: userId, credits_amount: amount_usd * CREDITS_PER_USD }
   })
5. Retornar { checkout_url } → frontend redirige al usuario
```

### `POST /api/webhooks/stripe` — Webhook de Stripe
**Auth:** Stripe signature (`stripe-signature` header)

```
1. stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
2. Si error de firma → 400 (no procesar)
3. Switch event.type:
   case 'checkout.session.completed':
     - Extraer metadata.user_id y metadata.credits_amount
     - Extraer session_id = event.data.object.id
     - BEGIN (SERIALIZABLE):
       a. INSERT credit_transactions {
            user_id, amount: +credits_amount, type: 'topup',
            stripe_session_id: session_id,
            description: 'Recarga via Stripe'
          } ON CONFLICT (stripe_session_id) DO NOTHING   -- (P0.2 Ronda 3: idempotencia atómica por índice UNIQUE)
       b. Si el INSERT insertó 0 filas → ROLLBACK; retornar 200 (ya procesado)
       c. UPDATE users SET credits_balance += credits_amount WHERE id = user_id
       COMMIT
     - Notificar via Supabase Realtime (dashboard se actualiza automáticamente)
4. Retornar 200 (Stripe reintenta si no recibe 200)
```

**Idempotencia (P0.2 Ronda 3):** La idempotencia se garantiza mediante un índice `UNIQUE` parcial en `credit_transactions(stripe_session_id) WHERE stripe_session_id IS NOT NULL` (ver `database-schema`). Usar `INSERT ... ON CONFLICT DO NOTHING` en lugar de `SELECT` previo: elimina la race condition donde dos requests concurrentes del mismo evento pasarían ambos el `SELECT` y acreditarían el doble.

### `GET /api/dashboard/credits` — Balance e historial
**Auth:** Session (Clerk)

```
Query: limit=20, offset=0

Response:
{
  "balance_credits": 1500,
  "balance_usd": "15.00",
  "transactions": [
    {
      "id": "...",
      "type": "topup",
      "amount": 500,
      "description": "Recarga via Stripe",
      "contract_id": null,
      "created_at": "2026-04-03T12:00:00Z"
    }
  ],
  "total": 47
}
```

---

## Operaciones de Créditos (Internos)

Todas las operaciones internas de créditos son ejecutadas por los otros módulos (jobs, contracts) usando estas funciones. Los helpers están alineados al ledger definido en `contracts-escrow/2-technical/spec.md`.

```typescript
// Evento 1: Bloquear créditos al crear job
async function holdJobEscrow(userId: string, jobId: string, amount: number) {
  // BEGIN SERIALIZABLE
  // SELECT credits_balance FROM users WHERE id = userId FOR UPDATE
  // Si balance < amount → throw INSUFFICIENT_CREDITS
  // UPDATE users SET credits_balance -= amount
  // INSERT credit_transactions { user_id: userId, type: 'escrow_hold', amount: -amount, job_id: jobId }
  // COMMIT
}

// Evento 2: Ajustar escrow al contratar (solo la diferencia)
async function adjustEscrowForHire(userId: string, jobId: string, contractId: string, diff: number) {
  // diff > 0 → debitar diferencia; diff < 0 → devolver diferencia; diff = 0 → no hacer nada
  // BEGIN SERIALIZABLE
  // Si diff > 0: (P1.2 Ronda 3: validar saldo antes de debitar)
  //   SELECT credits_balance FROM users WHERE id = userId FOR UPDATE
  //   Si credits_balance < diff → throw INSUFFICIENT_CREDITS
  //   UPDATE users SET credits_balance -= diff
  //   INSERT credit_transactions { user_id: userId, type: 'escrow_hold', amount: -diff, job_id: jobId, contract_id: contractId }
  // Si diff < 0:
  //   UPDATE users SET credits_balance += |diff|
  //   INSERT credit_transactions { user_id: userId, type: 'escrow_release', amount: +|diff|, job_id: jobId, contract_id: contractId }
  // COMMIT
}

// Evento 3: Liquidar contrato completado (pago al hired_agent; fee como ingreso plataforma)
async function settleCompletedContract(hiredUserId: string, netAmount: number, feeAmount: number, contractId: string) {
  // BEGIN SERIALIZABLE
  // UPDATE users SET credits_balance += netAmount WHERE id = hiredUserId
  // INSERT credit_transactions { user_id: hiredUserId, type: 'payment', amount: +netAmount, contract_id: contractId }
  // INSERT credit_transactions { user_id: null, type: 'fee', amount: +feeAmount, contract_id: contractId }
  //   -- user_id = NULL: ingreso de plataforma, NO modifica ningún users.credits_balance
  // COMMIT
}

// Evento 4: Liberar escrow al cancelar job (devolver budget completo al owner)
async function releaseJobEscrow(userId: string, jobId: string, amount: number) {
  // BEGIN SERIALIZABLE
  // UPDATE users SET credits_balance += amount
  // INSERT credit_transactions { user_id: userId, type: 'escrow_release', amount: +amount, job_id: jobId }
  // COMMIT
}

// Evento 5: Liberar escrow al rechazar contrato pendiente de aprobación
async function releaseContractEscrowOnReject(userId: string, contractId: string, amount: number) {
  // BEGIN SERIALIZABLE
  // UPDATE users SET credits_balance += amount
  // INSERT credit_transactions { user_id: userId, type: 'escrow_release', amount: +amount, contract_id: contractId }
  // COMMIT
}
```

---

## Modelo de Datos

```sql
-- Ver definición completa en: meli/wip/20260403-database-schema/2-technical/spec.md
credit_transactions:
  id UUID PK
  user_id UUID FK → users (nullable — NULL solo para type='fee', ingreso de plataforma; constraint en DB lo garantiza)
  contract_id UUID FK → contracts (nullable)
  job_id UUID FK → jobs (nullable)              -- para escrow_hold/release de jobs (P1.1)
  stripe_session_id VARCHAR(255)                -- idempotencia webhooks Stripe (P1.1)
  amount DECIMAL(12,2)                          -- positivo = ingreso, negativo = egreso
  type VARCHAR(30) CHECK IN ('topup','escrow_hold','escrow_release','payment','fee','refund')
  description TEXT NOT NULL
  created_at TIMESTAMPTZ                        -- append-only, nunca se actualiza
```

---

## Seguridad

- **Webhook signature:** SIEMPRE verificar firma Stripe. Nunca procesar sin verificación.
- **Idempotencia:** Guardar `stripe_session_id` y chequear antes de acreditar.
- **No confiar en metadata:** Validar que el `user_id` en metadata corresponde a un usuario real en DB.
- **credits_balance >= 0:** Constraint en DB como última línea de defensa.
- **Isolation SERIALIZABLE:** Previene race conditions al debitar y acreditar simultáneamente.

---

## Variables de Entorno

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
CREDITS_PER_USD=100
PLATFORM_FEE_TIER_1=0.05
PLATFORM_FEE_TIER_2=0.08
PLATFORM_FEE_TIER_3=0.10
LOW_BALANCE_ALERT_THRESHOLD=20
```

---

## Testing

| Test | Tipo |
|---|---|
| POST /topup → retorna checkout_url de Stripe | Integration (Stripe test mode) |
| Webhook checkout.session.completed → créditos acreditados | Integration |
| Webhook procesado dos veces → idempotente, no duplica créditos | Integration |
| Webhook con firma inválida → 400 | Unit |
| holdEscrow con balance insuficiente → INSUFFICIENT_CREDITS | Unit |
| Race condition: dos holdEscrow simultáneos con balance justo → solo uno ejecuta | Integration |
| Balance visible en dashboard tras recarga | E2E |
| Historial de transacciones append-only (no update/delete) | Integration |
