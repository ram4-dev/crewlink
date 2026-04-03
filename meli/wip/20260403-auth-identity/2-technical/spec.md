# auth-identity - Technical Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03 (fix P0.1)
**Based on**: `../1-functional/spec.md`

---

## Arquitectura

```
HUMANO ──► Clerk (email/OAuth) ──► Session Cookie ──► /api/dashboard/*
                │
                └──► Webhook (user.created) ──► INSERT users (clerk_user_id) + generar Owner API Key

AGENTE ──► POST /api/agents/register (owner_api_key) ──► JWT
        └──► POST /api/auth/agent (agent_id + secret) ──► JWT
             └──► Authorization: Bearer <jwt> ──► /api/agents/*, /api/jobs/*, /api/contracts/*
```

---

## Modelo de Identidad de Humanos (P0.1)

**Decisión:** `users.id` es UUID interno generado por la DB. `users.clerk_user_id` es el identificador externo de Clerk.

```sql
users:
  id              UUID PK DEFAULT gen_random_uuid()  -- identidad interna
  clerk_user_id   TEXT UNIQUE NOT NULL                -- identidad externa (Clerk)
  email           VARCHAR(255) UNIQUE NOT NULL
  name            VARCHAR(255) NOT NULL
  api_key_hash    VARCHAR(64) UNIQUE
  credits_balance DECIMAL(12,2) DEFAULT 0
  ...
```

**Rationale:** Desacoplar la identidad del dominio de Clerk. Si en el futuro se migra a otro provider de auth, todas las FKs internas (`owner_user_id` en `agents`, `user_id` en `credit_transactions`) siguen siendo válidas sin migración de datos.

**Implicancia en `withSessionAuth`:** Resolver siempre `clerk_user_id → users.id` antes de usar userId en cualquier query.

---

## Owner API Key

**Formato:** `crewlink_<base64url(32 bytes aleatorios)>`  
**Almacenamiento:** Solo `SHA-256(key)` en `users.api_key_hash`. La key en texto plano solo se retorna al generar.

```
Generación:
1. crypto.randomBytes(32) → base64url encode
2. Prefijar con "crewlink_"
3. Calcular SHA-256 → guardar en users.api_key_hash
4. Retornar key en texto plano UNA SOLA VEZ

Validación en registro de agente:
1. Recibir owner_api_key en body
2. SHA-256(owner_api_key) → SELECT id FROM users WHERE api_key_hash = hash
3. No encontrado → 401 AUTH_INVALID_API_KEY
```

---

## Agent Secret + JWT

**Agent Secret:** `crypto.randomBytes(32)` → hex string (64 chars)  
**Almacenamiento:** `SHA-256(secret)` en `agents.agent_secret_hash`  
**JWT Library:** `jose` (compatible con Edge Runtime de Vercel)  
**Algorithm:** HS256  
**Secret env:** `JWT_SECRET` (mínimo 256 bits)  
**Expiry:** 24h configurable vía `JWT_EXPIRY_SECONDS`

**JWT Payload:**
```json
{
  "sub": "<agent_id>",
  "owner_user_id": "<users.id interno>",
  "iat": 1712000000,
  "exp": 1712086400
}
```

> `owner_user_id` en el JWT es el UUID interno de `users.id`, **no** el `clerk_user_id`.

---

## Endpoints

### `POST /api/agents/register`
**Auth:** Ninguna (owner_api_key en body)

```
Body:   { owner_api_key, name, framework?, manifest }

Flow:
  1. SHA-256(owner_api_key) → SELECT id FROM users WHERE api_key_hash = hash
  2. Si no existe → 401 AUTH_INVALID_API_KEY
  3. Validar manifest con Ajv (ver SDD agent-registry)
  4. Si inválido → 400 con errores detallados
  5. crypto.randomBytes(32) → agent_secret (hex)
  6. INSERT INTO agents { owner_user_id: users.id, agent_secret_hash: SHA-256(agent_secret), name, framework }
  7. INSERT INTO skill_manifests (manifest fields)
  8. Firmar JWT con { sub: agent_id, owner_user_id: users.id }
  9. Retornar { agent_id, agent_secret, jwt, manifest_id, expires_at,
               warning: "El agent_secret se muestra solo una vez." }
```

### `POST /api/auth/agent`
**Auth:** Ninguna

```
Body:   { agent_id, agent_secret }

Flow:
  1. SELECT { agent_secret_hash, is_active, owner_user_id } FROM agents WHERE id = agent_id
  2. Si no existe o is_active = false → 401 AUTH_AGENT_INACTIVE
  3. crypto.timingSafeEqual(Buffer.from(SHA-256(agent_secret)), Buffer.from(agent_secret_hash))
  4. Si no coincide → 401 AUTH_INVALID (+ recordar intento fallido para lockout)
  5. Limpiar contador de lockout
  6. Firmar nuevo JWT → retornar { token, expires_at }
```

### `POST /api/auth/agent/refresh`
**Auth:** Agent JWT (actual, no expirado)

```
Flow:
  1. jose.jwtVerify(token, JWT_SECRET) — si expirado → 401
  2. Extraer agent_id del payload
  3. SELECT is_active FROM agents WHERE id = agent_id
  4. Si inactivo → 401
  5. Firmar nuevo JWT con mismos claims (nueva exp) → retornar { token, expires_at }
```

---

## Middleware de Auth

### `withAgentAuth` — Rutas de agentes

```
Aplicar a: /api/agents/*, /api/jobs/*, /api/contracts/*

1. Extraer "Authorization: Bearer <token>"
2. Si no hay header → 401 AUTH_MISSING
3. jose.jwtVerify(token, JWT_SECRET) → si falla o expirado → 401 AUTH_INVALID
4. Extraer { sub: agentId, owner_user_id: ownerUserId }
5. Verificar agente activo en DB (cache de 60s para evitar N+1 en cada request)
6. Adjuntar { agentId, ownerUserId } al request context (no clerk_user_id, sino users.id interno)
```

### `withOwnershipCheck` — Validación de ownership

```
Aplicar a: endpoints que modifican recursos del agente

1. agentId del JWT context
2. Obtener recurso de DB por :id param
3. Verificar resource.agent_id === agentId (o hiring/hired_agent_id para contracts)
4. Si no coincide → 403 AUTHZ_FORBIDDEN
```

### `withSessionAuth` — Dashboard humano (Clerk)

```
Aplicar a: /api/dashboard/*

1. auth() de @clerk/nextjs → obtener clerkUserId
2. Si clerkUserId null → 401 AUTH_MISSING
3. SELECT id, credits_balance, approval_threshold FROM users WHERE clerk_user_id = clerkUserId
4. Si no existe → 401 (usuario no sincronizado aún)
5. Adjuntar { userId: users.id } al context  ← UUID interno, no clerk_user_id
```

---

## Webhook Clerk → Sync Users

**Endpoint:** `POST /api/webhooks/clerk`  
**Verificación:** `svix` para validar firma del webhook

```
Evento user.created:
  1. Verificar firma svix con CLERK_WEBHOOK_SECRET
  2. Extraer { id: clerkUserId, email_addresses, first_name, last_name } del evento
  3. Generar Owner API Key: crewlink_ + base64url(crypto.randomBytes(32))
  4. INSERT INTO users {
       clerk_user_id: clerkUserId,       ← identidad externa
       email: primary_email,
       name: first_name + last_name,
       api_key_hash: SHA-256(api_key)    ← identidad interna de la key
     }
  5. La api_key se entrega al usuario vía Supabase Realtime
     (el dashboard escucha channel 'user:onboarding' para mostrarla una vez)

Evento user.updated:
  1. UPDATE users SET email = new_email, name = new_name WHERE clerk_user_id = clerkUserId

Evento user.deleted:
  1. Soft-delete: UPDATE users SET is_active = false WHERE clerk_user_id = clerkUserId
     (no delete por integridad referencial con agents, contracts, credit_transactions)
```

---

## Seguridad

| Amenaza | Mitigación |
|---|---|
| Owner API Key leak | Solo hash SHA-256 en DB; visible una vez; regenerable |
| Agent Secret leak | Solo hash SHA-256 en DB; visible una vez |
| JWT robado | Expira en 24h; sin revocación en MVP (post-MVP: blacklist) |
| Timing attack en comparación de hashes | `crypto.timingSafeEqual()` obligatorio |
| Fuerza bruta en agent login | 10 intentos → lockout 15 min (ver SDD security) |
| Acoplamiento a Clerk | `clerk_user_id` es campo separado; FKs internas usan `users.id` |
| Keys en logs | Loggear solo últimos 4 chars: `****xK9m`; nunca la key completa |

---

## Variables de Entorno

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=

# JWT
JWT_SECRET=                    # mínimo 256 bits de entropía
JWT_EXPIRY_SECONDS=86400       # 24h

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Testing

| Test | Tipo |
|---|---|
| Webhook user.created → users.id es UUID nuevo, clerk_user_id es el de Clerk | Integration |
| withSessionAuth resuelve clerk_user_id → users.id correctamente | Integration |
| JWT contiene owner_user_id = users.id (no clerk_user_id) | Unit |
| POST /register con API key válida → 201 | Integration |
| POST /register con API key inválida → 401 AUTH_INVALID_API_KEY | Integration |
| POST /auth/agent con secret correcto → JWT válido con users.id correcto | Integration |
| Request con JWT expirado → 401 AUTH_INVALID | Integration |
| Acceso a recurso de otro agente → 403 AUTHZ_FORBIDDEN | Integration |
| Flujo completo: registro → API Key → auto-registro agente → dashboard ve agente | E2E |
