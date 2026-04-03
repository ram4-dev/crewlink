# dashboard - Technical Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03 (fix P0.1, P1.5, P2.1; Ronda 2: P1.2; Ronda 3: P0.3)
**Based on**: `../1-functional/spec.md`

---

## Stack Frontend

| Componente | Tecnología |
|---|---|
| Framework | Next.js 15 App Router |
| Auth | Clerk (componentes `<UserButton>`, `<SignIn>`) |
| UI | Tailwind CSS + shadcn/ui |
| Realtime | Supabase Realtime (subscriptions) |
| Formularios | React Hook Form + Zod |
| Fetching | Server Components + SWR para client-side |

---

## Endpoints API del Dashboard

Todos los endpoints bajo `/api/dashboard/*` usan `withSessionAuth` (ver SDD auth-identity).

### `GET /api/dashboard/agents` — Lista de agentes
```
SELECT a.*, COUNT(c.id) active_contracts
FROM agents a
LEFT JOIN contracts c ON c.hiring_agent_id = a.id AND c.status = 'active'
WHERE a.owner_user_id = :userId
GROUP BY a.id
ORDER BY a.created_at DESC
```

### `PATCH /api/dashboard/agents/:id` — Activar/desactivar agente
```
Body: { is_active: boolean }
1. Verificar agents.owner_user_id = session.userId
2. Si is_active = false (desactivar): (P0.3 Ronda 3)
   - SELECT COUNT(*) FROM contracts
     WHERE (hiring_agent_id = :id OR hired_agent_id = :id)
       AND status IN ('pending_approval', 'active', 'disputed')
   - Si COUNT > 0 → 409 AGENT_HAS_ACTIVE_CONTRACTS
     { "error": "Cannot deactivate agent with open contracts", "code": "AGENT_HAS_ACTIVE_CONTRACTS",
       "details": { "open_contracts": N } }
   - Solo se puede desactivar si no hay contratos abiertos
3. UPDATE agents SET is_active = :is_active
```

> **Rationale (P0.3):** `withAgentAuth` verifica que el agente esté activo. Si se permite desactivar un agente con contratos `active` o `disputed`, ese agente quedará incapaz de llamar `/complete` o `/dispute` — dejando contratos en estado no resoluble. Bloquear la desactivación es la regla más simple y evita estados huérfanos.

### `GET /api/dashboard/contracts` — Lista de contratos del owner
```
Query: status?, limit=20, offset=0

SELECT c.*, a_hiring.name hiring_agent_name, a_hired.name hired_agent_name, j.title job_title
FROM contracts c
JOIN agents a_hiring ON c.hiring_agent_id = a_hiring.id
JOIN agents a_hired  ON c.hired_agent_id  = a_hired.id
JOIN jobs j ON c.job_id = j.id
WHERE a_hiring.owner_user_id = :userId OR a_hired.owner_user_id = :userId
ORDER BY
  CASE WHEN c.status = 'pending_approval' THEN 0 ELSE 1 END,  -- pending primero
  c.created_at DESC
```

### `POST /api/dashboard/contracts/:id/approve` — Aprobar contrato
```
1. Verificar que hiring_agent.owner_user_id = session.userId (users.id interno — P0.1)
2. Verificar contract.status = 'pending_approval' → si no, 409
3. BEGIN:
   a. UPDATE contracts SET status = 'active'
   b. UPDATE jobs SET status = 'in_progress' WHERE id = contract.job_id  -- (P1.5)
   COMMIT
4. Notificar vía Realtime al hiring_agent y hired_agent
→ 200
```

### `POST /api/dashboard/contracts/:id/reject` — Rechazar contrato
```
1. Verificar ownership: hiring_agent.owner_user_id = session.userId (users.id interno)
2. Verificar contract.status = 'pending_approval' → si no, 409 NOT_PENDING_APPROVAL
3. BEGIN SERIALIZABLE:
   a. UPDATE contracts SET status = 'cancelled'
   b. UPDATE users SET credits_balance += contract.escrow_credits WHERE id = hiring_owner_user_id
   c. INSERT credit_transaction { type: 'escrow_release', amount: +escrow_credits, contract_id }
   d. UPDATE jobs SET status = 'open' WHERE id = contract.job_id         -- (P1.5)
   e. UPDATE applications SET status = 'pending'
        WHERE job_id = contract.job_id AND status = 'rejected'           -- (P1.5: reabrir las descartadas)
   COMMIT
→ 200 { message: "Contrato rechazado. El job vuelve a recibir aplicaciones." }
```

### `GET /api/dashboard/api-key` — Preview de API Key (P2.1)
```
// La key real no está en DB. Solo existe el hash → no se puede retornar la key real.
Response:
{
  "key_preview": "crewlink_****xxxx",  // últimos 4 chars del hash (no de la key)
  "last_regenerated_at": "2026-04-03T12:00:00Z"
}
```
> Nota: Los 4 últimos caracteres son del hash SHA-256, no de la key en texto plano (que no se almacena). Son solo orientativos para que el owner identifique si cambió.

### `POST /api/dashboard/api-key/rotate` — Rotar API Key (P2.1)
```
Body: { confirm: true }  // prevenir rotación accidental

1. Verificar confirm = true → si no, 400 CONFIRMATION_REQUIRED
2. Generar nueva key: crewlink_ + base64url(crypto.randomBytes(32))
3. UPDATE users SET api_key_hash = SHA-256(new_key), api_key_rotated_at = NOW()
4. Retornar { new_key, rotated_at }  // new_key se muestra UNA SOLA VEZ
```

> Endpoint: `/api/dashboard/api-key/rotate`. Label en UI: "Rotar API Key". Archivo: `api-key/rotate/route.ts`. (P1.2 Ronda 2: naming definitivo — no usar "regenerate" en ningún contexto.)

### `PATCH /api/dashboard/settings` — Actualizar configuración
```
Body: { approval_threshold? }
1. Validar approval_threshold > 0
2. UPDATE users SET approval_threshold = :threshold WHERE id = :userId
→ 200
```

---

## Realtime en el Dashboard (Cliente)

```typescript
// Suscripción en el cliente (React component)
useEffect(() => {
  const channel = supabase
    .channel('dashboard-updates')
    .on('postgres_changes', {
      event: 'INSERT',
      table: 'contracts',
      filter: `hiring_agent_id=in.(${agentIds.join(',')})`
    }, () => mutate('/api/dashboard/contracts'))  // SWR revalidation
    .on('postgres_changes', {
      event: 'UPDATE',
      table: 'contracts',
      filter: `status=eq.pending_approval`
    }, () => mutate('/api/dashboard/contracts'))
    .subscribe()
  
  return () => supabase.removeChannel(channel)
}, [agentIds])
```

---

## Estructura de Carpetas (Next.js App Router)

```
app/
  dashboard/
    layout.tsx              -- sidebar + navbar con Clerk UserButton
    page.tsx                -- home: tarjetas resumen
    agents/
      page.tsx              -- lista de agentes
      [id]/page.tsx         -- detalle de agente
    contracts/
      page.tsx              -- lista de contratos
      [id]/page.tsx         -- detalle de contrato
    credits/
      page.tsx              -- balance + historial
    settings/
      page.tsx              -- API Key + threshold

api/dashboard/
  agents/route.ts
  agents/[id]/route.ts
  contracts/route.ts
  contracts/[id]/approve/route.ts
  contracts/[id]/reject/route.ts
  api-key/route.ts
  api-key/rotate/route.ts
  settings/route.ts
  credits/route.ts
```

---

## Seguridad

- Todas las rutas de dashboard usan `auth()` de Clerk en el layout (`app/dashboard/layout.tsx`)
- Si no hay sesión → redirect a `/sign-in`
- Los endpoints API validan `withSessionAuth` middleware
- `approval_threshold` solo puede ser modificado por el propio owner

---

## Testing

| Test | Tipo |
|---|---|
| Dashboard redirige a /sign-in si no hay sesión | E2E |
| Lista de agentes muestra solo los del owner | Integration |
| Desactivar agente con contratos activos → 409 AGENT_HAS_ACTIVE_CONTRACTS | Integration |
| Desactivar agente sin contratos activos → 200 OK | Integration |
| Aprobar contrato → status cambia a active | Integration |
| Rechazar contrato → escrow devuelto, job vuelve a open | Integration |
| Rotar API Key (POST /rotate) → respuesta contiene nueva key, formato correcto | Integration |
| Cambiar approval_threshold → nuevos contratos usan el nuevo umbral | Integration |
