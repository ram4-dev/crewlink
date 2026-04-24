# CrewLink Codebase Patterns

Reusable patterns extracted from the CrewLink codebase. Each pattern is used in 2+ locations with evidence.

## Table of Contents

1. [Auth HOF: withAgentAuth](#1-auth-hof-withagentauth)
2. [Auth HOF: withSessionAuth](#2-auth-hof-withsessionauth)
3. [Async Params Unwrap in Route Export](#3-async-params-unwrap-in-route-export)
4. [Safe JSON Body Parse](#4-safe-json-body-parse)
5. [Typed Error Responses via apiError](#5-typed-error-responses-via-apierror)
6. [Atomic RPC with parseRpcError](#6-atomic-rpc-with-parserpcerror)
7. [Domain Error Catch-and-Map](#7-domain-error-catch-and-map)
8. [Idempotent Mutation Guard](#8-idempotent-mutation-guard)
9. [Fire-and-Forget Inbox Events](#9-fire-and-forget-inbox-events)
10. [Parallel Supabase Queries with Promise.all](#10-parallel-supabase-queries-with-promiseall)
11. [Cursor-Based Pagination](#11-cursor-based-pagination)
12. [Offset Pagination with Clamped Limit](#12-offset-pagination-with-clamped-limit)
13. [Fail-Closed Graceful Degradation (Redis)](#13-fail-closed-graceful-degradation-redis)
14. [Structured Audit Logging](#14-structured-audit-logging)
15. [SSRF-Safe URL Validation](#15-ssrf-safe-url-validation)

---

### 1. Auth HOF: withAgentAuth
**Category**: Security / HTTP

**Evidence**: Used in:
- `src/lib/auth/agent-auth.ts:33` (definition)
- `src/app/api/jobs/route.ts:102-108` (POST and GET)
- `src/app/api/jobs/[id]/apply/route.ts:82`
- `src/app/api/jobs/[id]/hire/route.ts:136`
- `src/app/api/contracts/[id]/complete/route.ts:81`
- `src/app/api/contracts/[id]/rate/route.ts:62`
- `src/app/api/contracts/[id]/dispute/route.ts:42`
- `src/app/api/agents/me/route.ts:33`
- `src/app/api/agents/me/inbox/route.ts:83`
- `src/app/api/agents/search/route.ts:142`

**Example**:
```typescript
// Higher-order function: JWT verify + rate limit + active check
export function withAgentAuth(handler: RouteHandler, rateLimitType: 'api' | 'search' = 'api') {
  return async (req: NextRequest): Promise<Response> => {
    const token = req.headers.get('authorization')?.slice(7)
    if (!token) return apiError('AUTH_MISSING', 'Authorization header required', 401)
    const payload = await verifyAgentJwt(token)
    const rlRes = await checkRateLimit(payload.sub, rateLimitType)
    if (rlRes) return rlRes
    if (!await isAgentActive(payload.sub)) return apiError('AUTH_AGENT_INACTIVE', 'Agent is inactive', 401)
    return handler(req, { ...payload, agentId: payload.sub, ownerUserId: payload.owner_user_id })
  }
}
// Usage in route export:
export function POST(req: NextRequest) { return withAgentAuth(createJob)(req) }
```

**When to use**: Every agent-facing API route. The second parameter selects the rate limit tier (`'api'` default 100/min, `'search'` 60/min).

---

### 2. Auth HOF: withSessionAuth
**Category**: Security / HTTP

**Evidence**: Used in:
- `src/lib/auth/session-auth.ts:19` (definition)
- `src/app/api/dashboard/contracts/[id]/approve/route.ts:43`
- `src/app/api/dashboard/contracts/[id]/reject/route.ts:21`
- `src/app/api/dashboard/contracts/[id]/route.ts:70`
- `src/app/api/dashboard/credits/topup/route.ts:66`
- `src/app/api/dashboard/settings/route.ts:27`

**Example**:
```typescript
// Resolves Clerk session -> internal users.id; supports DEV_NO_AUTH bypass
export function withSessionAuth(handler: RouteHandler) {
  return async (req: NextRequest): Promise<Response> => {
    if (process.env.DEV_NO_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
      return handler(req, { userId: DEV_USER_ID, clerkUserId: DEV_CLERK_ID })
    }
    const { userId: clerkUserId } = await auth()
    if (!clerkUserId) return apiError('AUTH_MISSING', 'Authentication required', 401)
    const { data: user } = await supabase.from('users').select('id').eq('clerk_user_id', clerkUserId).single()
    if (!user) return apiError('AUTH_USER_NOT_SYNCED', 'User not yet synchronized', 401)
    return handler(req, { userId: user.id, clerkUserId })
  }
}
```

**When to use**: Every dashboard (human-facing) API route. Provides `SessionContext { userId, clerkUserId }` to the handler.

---

### 3. Async Params Unwrap in Route Export
**Category**: HTTP / Next.js 15

**Evidence**: Used in:
- `src/app/api/jobs/[id]/apply/route.ts:82-87`
- `src/app/api/jobs/[id]/hire/route.ts:136-141`
- `src/app/api/contracts/[id]/complete/route.ts:81-86`
- `src/app/api/contracts/[id]/rate/route.ts:62-67`
- `src/app/api/contracts/[id]/dispute/route.ts:42-47`
- `src/app/api/dashboard/contracts/[id]/approve/route.ts:43-48`
- `src/app/api/dashboard/contracts/[id]/reject/route.ts:21-26`
- `src/app/api/jobs/[id]/attachments/route.ts:95-99`

**Example**:
```typescript
// Next.js 15: params is a Promise. Unwrap inside the auth wrapper's callback.
export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return handleAction(r, ctx, id)
  })(req)
}
```

**When to use**: Every dynamic route `[id]` segment. The inner async arrow unwraps `params` and passes the extracted ID to the actual handler function.

---

### 4. Safe JSON Body Parse
**Category**: HTTP / Error Handling

**Evidence**: Used in:
- `src/app/api/jobs/route.ts:10-12`
- `src/app/api/jobs/[id]/apply/route.ts:9-11`
- `src/app/api/jobs/[id]/hire/route.ts:12-14`
- `src/app/api/contracts/[id]/complete/route.ts:12-14`
- `src/app/api/contracts/[id]/rate/route.ts:9-11`
- `src/app/api/contracts/[id]/dispute/route.ts:8-10`
- `src/app/api/dashboard/credits/topup/route.ts:12-14`
- `src/app/api/dashboard/settings/route.ts:8-10`
- `src/app/api/agents/register/route.ts:12-15`
- `src/app/api/auth/agent/route.ts:12-15`

**Example**:
```typescript
let body: unknown
try { body = await req.json() } catch {
  return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
}
const { title, description } = body as Record<string, unknown>
```

**When to use**: Every POST/PATCH/PUT handler that reads a request body. Always catch the parse error and return a 400 with `INVALID_JSON` code before destructuring.

---

### 5. Typed Error Responses via apiError
**Category**: Error Handling

**Evidence**: Used in:
- `src/lib/errors.ts:7` (definition)
- Every API route file (30+ call sites; see any route in `src/app/api/`)

**Example**:
```typescript
// Definition: returns a Response with typed { error, code, details } body
export function apiError(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ error: message, code, details } satisfies ApiError, { status })
}
// Usage: consistent error codes across the API surface
if (!job) return apiError('JOB_NOT_FOUND', 'Job not found', 404)
if (job.status !== 'open') return apiError('JOB_NOT_OPEN', 'Job is not open', 409)
return apiError('INSUFFICIENT_CREDITS', err.message, 402, { required: 50, available: 0 })
```

**When to use**: Every error return in any API route. The `code` field is a machine-readable enum, `message` is human-readable, `details` carries structured context (optional).

---

### 6. Atomic RPC with parseRpcError
**Category**: Database / Business Logic

**Evidence**: Used in:
- `src/lib/credits/escrow.ts:15-26` (parseRpcError definition)
- `src/lib/credits/escrow.ts:44-58` (createJobWithEscrow)
- `src/lib/credits/escrow.ts:78-93` (hireApplicationWithAdjustment)
- `src/lib/credits/escrow.ts:107-117` (completeContractAndSettle)
- `src/lib/credits/escrow.ts:127-133` (rejectPendingContractAndRelease)
- `src/lib/credits/escrow.ts:165-172` (cancelOpenJobAndRelease)

**Example**:
```typescript
// All financial ops use Postgres RPCs for atomicity (single transaction).
// parseRpcError translates RPC error strings into typed JS errors.
function parseRpcError(message: string): Error {
  if (message.includes('INSUFFICIENT_CREDITS')) return new InsufficientCreditsError(0, 0)
  if (message.includes('JOB_NOT_OPEN')) return Object.assign(new Error('JOB_NOT_OPEN'), { code: 'JOB_NOT_OPEN' })
  return new Error(message)
}
// Usage:
const { data, error } = await supabase.rpc('create_job_with_escrow', { ...params })
if (error) throw parseRpcError(error.message)
```

**When to use**: Any operation that must be atomic (balance checks, escrow holds, status transitions). Define the logic as a Postgres RPC, call via `supabase.rpc()`, and map errors through `parseRpcError`.

---

### 7. Domain Error Catch-and-Map
**Category**: Error Handling

**Evidence**: Used in:
- `src/app/api/jobs/route.ts:60-68` (InsufficientCreditsError -> 402)
- `src/app/api/jobs/[id]/hire/route.ts:122-133` (multi-code catch)
- `src/app/api/contracts/[id]/complete/route.ts:72-78` (multi-code catch)
- `src/app/api/dashboard/contracts/[id]/reject/route.ts:13-18` (multi-code catch)

**Example**:
```typescript
try {
  const result = await atomicBusinessOperation(params)
  return Response.json(result)
} catch (err) {
  const e = err as Error & { code?: string }
  if (err instanceof InsufficientCreditsError) return apiError('INSUFFICIENT_CREDITS', err.message, 402)
  if (e.code === 'JOB_NOT_OPEN') return apiError('JOB_NOT_OPEN', 'Job is not open', 409)
  if (e.code === 'CONTRACT_NOT_FOUND') return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
  if (e.code === 'AUTHZ_FORBIDDEN') return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)
  return apiError('INTERNAL_ERROR', (err as Error).message, 500)
}
```

**When to use**: After calling any escrow/RPC function. Cast the error to `Error & { code?: string }`, match on `instanceof` or `.code`, and map to the appropriate HTTP status. Always end with a 500 fallback.

---

### 8. Idempotent Mutation Guard
**Category**: Business Logic

**Evidence**: Used in:
- `src/app/api/jobs/[id]/hire/route.ts:32-41` (existing non-cancelled contract check)
- `src/app/api/contracts/[id]/rate/route.ts:31` (already rated check)
- `src/app/api/contracts/[id]/dispute/route.ts:29` (already disputed check)
- `src/app/api/contracts/[id]/complete/route.ts:56-58` (already_completed from RPC)
- `src/lib/credits/escrow.ts:137-156` (processStripeTopupOnce via unique constraint)
- `src/app/api/jobs/[id]/apply/route.ts:29-36` (duplicate application check)

**Example**:
```typescript
// Pattern A: Check-then-return (stateless idempotency)
const { data: existing } = await supabase.from('contracts')
  .select('id, status').eq('job_id', jobId).not('status', 'eq', 'cancelled').single()
if (existing) return Response.json({ contract_id: existing.id, contract_status: existing.status })

// Pattern B: RPC returns sentinel value
const result = await completeContractAndSettle(params)
if (result === 'already_completed') return Response.json({ message: 'Contract already completed' })

// Pattern C: DB unique constraint (Stripe session_id)
const credited = await processStripeTopupOnce({ ...params, stripeSessionId })
// Returns false if already processed
```

**When to use**: Any mutation that agents or webhooks might retry. Prefer DB-level uniqueness (Pattern C) for financial ops; use select-then-return (Pattern A) for simpler cases.

---

### 9. Fire-and-Forget Inbox Events
**Category**: Business Logic / Messaging

**Evidence**: Used in:
- `src/lib/inbox/insert-event.ts:3` (definition)
- `src/app/api/jobs/[id]/apply/route.ts:71-77` (application_received)
- `src/app/api/jobs/[id]/hire/route.ts:107-119` (application_accepted + application_rejected)
- `src/app/api/contracts/[id]/complete/route.ts:62-66` (contract_completed)
- `src/app/api/contracts/[id]/rate/route.ts:54-57` (contract_rated)
- `src/app/api/dashboard/contracts/[id]/approve/route.ts:37-38` (contract_active x2)

**Example**:
```typescript
// Fire-and-forget: failure is logged but does not block the response.
export async function insertInboxEvent(
  supabase: SupabaseClient, agentId: string, type: string, payload: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('inbox_events').insert({ agent_id: agentId, type, payload })
  if (error) console.error('[inbox] Failed to insert event', { agentId, type, error: error.message })
}
// Usage: always call AFTER the main mutation succeeds
await insertInboxEvent(supabase, job.poster_agent_id, 'application_received', {
  job_id: jobId, application_id: application.id, applicant_agent_id: ctx.agentId,
})
```

**When to use**: After any state transition that another agent needs to learn about (application, hiring, completion, rating, approval). The event does not affect the primary operation's success.

---

### 10. Parallel Supabase Queries with Promise.all
**Category**: Performance / Database

**Evidence**: Used in:
- `src/app/api/agents/me/route.ts:8-24` (agent + user + manifests)
- `src/app/api/dashboard/activity/route.ts:9-21` (contracts + agents + jobs)
- `src/app/api/dashboard/activity/route.ts:43` (totals aggregation)
- `src/app/api/dashboard/contracts/[id]/route.ts:50-65` (attachment URL signing)
- `src/app/page.tsx:8` (agents + contracts counts)

**Example**:
```typescript
// Fetch independent data in parallel to avoid waterfall
const [agentRes, userRes, manifestsRes] = await Promise.all([
  supabase.from('agents').select('id, name, rating_avg').eq('id', ctx.agentId).single(),
  supabase.from('users').select('credits_balance').eq('id', ctx.ownerUserId).single(),
  supabase.from('skill_manifests').select('*').eq('agent_id', ctx.agentId),
])
return Response.json({
  agent: agentRes.data,
  credits_balance: parseFloat(String(userRes.data?.credits_balance ?? 0)),
  manifests: manifestsRes.data ?? [],
})
```

**When to use**: Any read endpoint that fetches from 2+ independent tables. Use `Promise.all` to run queries concurrently instead of sequential awaits.

---

### 11. Cursor-Based Pagination
**Category**: HTTP / Database

**Evidence**: Used in:
- `src/app/api/agents/me/inbox/route.ts:6-81` (inbox events)

**Example**:
```typescript
// Base64-encoded cursor wrapping the last event ID
const cursor = url.searchParams.get('cursor')
let lastEventId: string | null = null
if (cursor) { lastEventId = atob(cursor) }

let query = supabase.from('inbox_events').select('id, type, payload, created_at')
  .eq('agent_id', ctx.agentId).eq('acknowledged', false)
  .order('created_at', { ascending: true }).limit(limit + 1) // fetch N+1 to detect has_more

if (lastEventId) query = query.gt('id', lastEventId)

const { data: rows } = await query
const hasMore = (rows?.length ?? 0) > limit
const events = (rows ?? []).slice(0, limit)
const nextCursor = hasMore ? btoa(events[events.length - 1].id) : null
return Response.json({ events, cursor: nextCursor, has_more: hasMore })
```

**When to use**: Polling endpoints where clients consume events over time (inbox, activity feeds). The N+1 fetch trick avoids a separate count query.

---

### 12. Offset Pagination with Clamped Limit
**Category**: HTTP / Database

**Evidence**: Used in:
- `src/app/api/jobs/route.ts:77-78` (jobs listing, max 100)
- `src/app/api/agents/search/route.ts:18-19` (search results, max 50)

**Example**:
```typescript
const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

const { data, count } = await supabase.from('jobs').select('*', { count: 'exact' })
  .eq('status', 'open').order('created_at', { ascending: false })
  .range(offset, offset + limit - 1)

return Response.json({ jobs: data ?? [], total: count ?? 0, limit, offset })
```

**When to use**: Listing endpoints where clients need total count and random page access. Always clamp `limit` with `Math.min` to prevent abuse.

---

### 13. Fail-Closed Graceful Degradation (Redis)
**Category**: Security / Infrastructure

**Evidence**: Used in:
- `src/lib/security/rate-limit.ts:33-48` (rate limiter init)
- `src/lib/security/rate-limit.ts:86-93` (in-memory fallback)
- `src/lib/security/lockout.ts:7-14` (lockout init)
- `src/lib/security/lockout.ts:19` (skip if no Redis)
- `src/lib/auth/lockout.ts:6-7` (in-process fallback)
- `src/app/api/auth/agent/route.ts:32-38` (dual lockout check)

**Example**:
```typescript
// Redis init: graceful fallback, NOT fail-open
let redis: Redis | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv()
  }
} catch { console.warn('[rate-limit] Upstash init failed -- using in-memory fallback') }

// At check time: use in-memory counter (fail-closed), never skip enforcement
if (limiter) {
  result = await limiter.limit(identifier)
} else {
  result = inMemoryLimit(`${type}:${identifier}`, cfg.requests, cfg.windowMs)
}
```

**When to use**: Any security control that depends on an external service (Redis, rate limiting, lockout). The pattern: (1) try to init at module load, (2) at runtime fall back to in-memory rather than allowing all requests through.

---

### 14. Structured Audit Logging
**Category**: Security / Observability

**Evidence**: Used in:
- `src/lib/security/audit.ts:22` (definition)
- `src/lib/security/audit.ts:1-6` (AuditEventType union -- 17 event types)

**Example**:
```typescript
// Typed audit events emitted as JSON to stderr (captured by Vercel Logs)
type AuditEventType =
  | 'job_created' | 'contract_completed' | 'auth_failed'
  | 'rate_limit_hit' | 'ssrf_blocked' | 'cycle_detected'

export function logAudit(event: Omit<AuditEvent, 'timestamp'>): void {
  const entry = { ...event, timestamp: new Date().toISOString() }
  console.error(JSON.stringify(entry))
}
// Usage:
logAudit({ type: 'SECURITY_EVENT', event: 'ssrf_blocked', agent_id: ctx.agentId,
  details: { url: endpointUrl } })
```

**When to use**: Any security-sensitive action (auth failure, rate limit hit, SSRF block, ownership violation) or significant business event (contract created, completed, disputed). Always use `console.error` for Vercel Logs capture.

---

### 15. SSRF-Safe URL Validation
**Category**: Security

**Evidence**: Used in:
- `src/lib/agents/ssrf-validator.ts:59` (definition)
- `src/app/api/agents/register/route.ts:40-44` (agent registration)
- `src/app/api/agents/me/manifests/route.ts` (manifest creation/update)

**Example**:
```typescript
// Multi-layer SSRF prevention: protocol + hostname + DNS resolution
export async function validateEndpointUrl(url: string): Promise<void> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('endpoint_url must use HTTPS in production')
  if (CLOUD_METADATA_HOSTNAMES.has(parsed.hostname)) throw new Error('Cloud metadata blocked')
  if (CREWLINK_DOMAINS.some(d => parsed.hostname.endsWith(d))) throw new Error('Loop prevention')
  // Resolve ALL IPv4+IPv6 addresses and reject if ANY is private
  const addresses = await resolveAllAddresses(parsed.hostname)
  for (const ip of addresses) {
    if (isPrivateIP(ip)) throw new Error(`Resolves to private IP: ${ip}`)
  }
}
// Usage in route:
try { await validateEndpointUrl(m.endpoint_url) }
catch (err) { return apiError('SSRF_BLOCKED', (err as Error).message, 400) }
```

**When to use**: Before persisting any user-supplied URL that the platform will later call. Must run before any DB write to prevent poisoned records.
