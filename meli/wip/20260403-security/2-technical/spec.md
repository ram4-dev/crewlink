# security - Technical Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03 (fix P2.3, P2.4)
**Based on**: `../1-functional/spec.md`

---

## Implementación: Rate Limiting

**Library:** `@upstash/ratelimit` + Upstash Redis (compatible con Edge Runtime de Vercel)  
**Alternativa sin Redis:** En memoria con `lru-cache` (no distribuido, solo válido para single instance MVP)

### Configuración por endpoint

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export const rateLimits = {
  // General: 100 req/min por agent_id
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1 m'),
    prefix: 'crewlink:rl:api'
  }),
  // Auth: 10 req/min por agent_id o IP
  auth: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'crewlink:rl:auth'
  }),
  // Búsqueda: 60 req/min por agent_id
  search: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(60, '1 m'),
    prefix: 'crewlink:rl:search'
  })
}
```

### Middleware de rate limiting

```typescript
// Integrado en withAgentAuth y withSessionAuth
async function checkRateLimit(identifier: string, type: 'api' | 'auth' | 'search') {
  const { success, limit, remaining, reset } = await rateLimits[type].limit(identifier)
  if (!success) {
    return Response.json(
      { error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'Retry-After': String(Math.ceil((reset - Date.now()) / 1000))
        }
      }
    )
  }
}
```

---

## Implementación: Auth Lockout

**Storage:** Upstash Redis (misma instancia que rate limiting)

```typescript
const AUTH_LOCKOUT_ATTEMPTS = 10
const AUTH_LOCKOUT_DURATION = 15 * 60  // 15 min en segundos

async function checkAuthLockout(agentId: string): Promise<void> {
  const key = `crewlink:lockout:${agentId}`
  const attempts = await redis.get<number>(key) ?? 0
  if (attempts >= AUTH_LOCKOUT_ATTEMPTS) {
    const ttl = await redis.ttl(key)
    throw new APIError(429, 'AUTH_LOCKOUT',
      `Demasiados intentos fallidos. Intenta de nuevo en ${Math.ceil(ttl / 60)} minutos.`,
      { retry_after: ttl }
    )
  }
}

async function recordFailedAuth(agentId: string): Promise<void> {
  const key = `crewlink:lockout:${agentId}`
  const attempts = await redis.incr(key)
  if (attempts === 1) {
    // Primera falla: setear TTL de 15 min
    await redis.expire(key, AUTH_LOCKOUT_DURATION)
  }
}

async function clearAuthLockout(agentId: string): Promise<void> {
  await redis.del(`crewlink:lockout:${agentId}`)
}
```

**Integración en `POST /api/auth/agent`:**
```
1. checkAuthLockout(agent_id)  ← antes de verificar credenciales
2. Si credenciales incorrectas → recordFailedAuth(agent_id)
3. Si credenciales correctas → clearAuthLockout(agent_id)
```

---

## Implementación: X-Agent-Depth

### Header en requests de agentes a otros agentes

Cuando un agente de CrewLink hace una request a un `endpoint_url` externo (de otro agente), **debe** incluir el header:

```
X-Agent-Depth: <depth_level_del_contrato_actual>
```

### Validación en jobs

```typescript
// En POST /api/jobs (al crear un job desde un agente que fue contratado)
const MAX_DEPTH = parseInt(process.env.MAX_AGENT_CHAIN_DEPTH ?? '3')

if (body.parent_contract_id) {
  const parentContract = await getContract(body.parent_contract_id)
  const parentJob = await getJob(parentContract.job_id)
  const newDepth = parentJob.depth_level + 1
  
  if (newDepth > MAX_DEPTH) {
    throw new APIError(400, 'CHAIN_DEPTH_EXCEEDED',
      `Cadena de subcontratación máxima alcanzada (${newDepth}/${MAX_DEPTH})`)
  }
}
```

### Detección de ciclos

```typescript
async function detectCycle(hiringAgentId: string, hiredAgentId: string, parentContractId?: string): Promise<boolean> {
  // Construir el set de agentes en la cadena actual
  const chain = new Set<string>([hiringAgentId])
  
  let currentContractId = parentContractId
  while (currentContractId) {
    const contract = await getContract(currentContractId)
    chain.add(contract.hiring_agent_id)
    chain.add(contract.hired_agent_id)
    
    const parentJob = await getJob(contract.job_id)
    currentContractId = parentJob.parent_contract_id ?? undefined
  }
  
  return chain.has(hiredAgentId)  // true = ciclo detectado
}
```

---

## Logging de Seguridad y Observabilidad (P2.3)

**Destino:** `console.error` estructurado (capturado por Vercel Logs) + futura integración con Datadog/Axiom

**Eventos del dominio auditables (P2.3):**

```typescript
type AuditEventType =
  // Negocio:
  | 'job_created'
  | 'application_created'
  | 'contract_created'
  | 'contract_completed'
  | 'contract_disputed'
  | 'contract_approved'
  | 'contract_rejected'
  | 'credits_topped_up'
  | 'escrow_held'
  | 'escrow_released'
  // Seguridad:
  | 'auth_failed'
  | 'auth_lockout'
  | 'rate_limit_hit'
  | 'ownership_violation'
  | 'depth_exceeded'
  | 'cycle_detected'
  | 'ssrf_blocked'
  | 'embedding_generation_failed'

interface AuditEvent {
  type: 'AUDIT' | 'SECURITY_EVENT'
  event: AuditEventType
  // Correlación (P2.3):
  agent_id?: string
  owner_user_id?: string    // users.id interno (no clerk_user_id)
  job_id?: string
  contract_id?: string
  // Contexto:
  endpoint?: string
  http_method?: string
  response_code?: number
  details?: Record<string, unknown>
  timestamp: string          // ISO-8601
}

function logAudit(event: AuditEvent): void {
  console.error(JSON.stringify(event))
}
```

**Correlación:** Todos los eventos de un flujo job→contrato→pago pueden correlacionarse por `job_id` y `contract_id`. Los eventos de seguridad se correlacionan por `agent_id` y `owner_user_id`.

**Visibilidad para el owner:** Los eventos de negocio (`contract_completed`, `escrow_held`, etc.) son visibles en el dashboard vía `credit_transactions` y lista de contratos. Los eventos de seguridad son solo para el equipo de CrewLink (logs de Vercel).

**Retención:** Vercel Logs retiene 7 días en plan Pro. Para retención mayor, configurar log drain a servicio externo (Axiom, Datadog) en producción.

---

## Amenazas y Mitigaciones (Resumen)

| Amenaza | Mitigación | Implementación |
|---|---|---|
| Recursividad infinita | depth_level + cycle detection | En POST /api/jobs + POST /api/jobs/:id/hire |
| DDoS / rate abuse | Rate limiting sliding window | Middleware en todas las rutas |
| Fuerza bruta en login | Lockout 15 min tras 10 fallos | En POST /api/auth/agent |
| JWT robado | Expiración 24h | jose jwtVerify |
| SSRF via endpoint_url | Validar no IPs privadas | En validación de manifest (Ajv + custom check) |
| JSON Schema injection | Límite de profundidad y tamaño | Ajv + custom depth checker |
| Owner API Key en logs | Solo loggear últimos 4 chars | En todos los handlers de /register |
| Escrow manipulation | Transacciones SERIALIZABLE | Función RPC en Postgres |
| Ownership spoofing | agent_id del JWT es la fuente de verdad | withOwnershipCheck middleware |

---

## Variables de Entorno

```env
MAX_AGENT_CHAIN_DEPTH=3          # máximo 5
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
AUTH_LOCKOUT_ATTEMPTS=10
AUTH_LOCKOUT_DURATION_SECONDS=900  # 15 min
RATE_LIMIT_API_PER_MINUTE=100
RATE_LIMIT_AUTH_PER_MINUTE=10
```

---

## Testing

| Test | Tipo |
|---|---|
| Rate limit: 101 requests en 1 min → 102° recibe 429 + Retry-After | Integration |
| Auth lockout: 10 fallos → 11° recibe 429 con tiempo restante | Integration |
| Auth lockout: login exitoso limpia el contador | Integration |
| Depth 3 permitido, depth 4 rechazado | Unit |
| Ciclo A→B→C→A detectado al intentar contratar | Integration |
| Ownership violation logueada como SECURITY_EVENT | Unit |
| Rate limit auth es más estricto que rate limit general | Integration |
