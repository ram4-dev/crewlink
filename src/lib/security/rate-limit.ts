import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// In-memory fallback — sliding window approximation using a Map.
// Not shared across instances; suitable for single-process dev/test only.
// In production, configure Upstash for distributed rate limiting.
type WindowEntry = { count: number; windowStart: number }
const memStore = new Map<string, WindowEntry>()

function inMemoryLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { success: boolean; limit: number; remaining: number; reset: number } {
  const now   = Date.now()
  const entry = memStore.get(key)

  if (!entry || now - entry.windowStart >= windowMs) {
    memStore.set(key, { count: 1, windowStart: now })
    return { success: true, limit: maxRequests, remaining: maxRequests - 1, reset: now + windowMs }
  }

  entry.count++
  return {
    success:   entry.count <= maxRequests,
    limit:     maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    reset:     entry.windowStart + windowMs,
  }
}

// Upstash client — initialized only when env vars are present
let redis: Redis | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv()
  }
} catch {
  console.warn('[rate-limit] Upstash Redis init failed — using in-memory fallback')
}

if (!redis && process.env.NODE_ENV === 'production') {
  console.warn(
    '[rate-limit] Upstash not configured in production. ' +
    'Running in degraded in-memory mode (not shared across instances). ' +
    'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for distributed rate limiting.'
  )
}

const API_LIMIT    = parseInt(process.env.RATE_LIMIT_API_PER_MINUTE ?? '100', 10)
const AUTH_LIMIT   = parseInt(process.env.RATE_LIMIT_AUTH_PER_MINUTE ?? '10', 10)
const SEARCH_LIMIT = 60

type LimitType = 'api' | 'auth' | 'search'

const LIMITS: Record<LimitType, { requests: number; windowMs: number; window: string }> = {
  api:    { requests: API_LIMIT,    windowMs: 60_000, window: '1 m' },
  auth:   { requests: AUTH_LIMIT,   windowMs: 60_000, window: '1 m' },
  search: { requests: SEARCH_LIMIT, windowMs: 60_000, window: '1 m' },
}

function makeRatelimit(type: LimitType): Ratelimit | null {
  if (!redis) return null
  const { requests, window } = LIMITS[type]
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(requests, window as `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`),
    prefix: `crewlink:rl:${type}`,
  })
}

const rateLimiters: Record<LimitType, Ratelimit | null> = {
  api:    makeRatelimit('api'),
  auth:   makeRatelimit('auth'),
  search: makeRatelimit('search'),
}

export async function checkRateLimit(
  identifier: string,
  type: LimitType
): Promise<Response | null> {
  const limiter = rateLimiters[type]
  const cfg     = LIMITS[type]

  let success: boolean, limit: number, remaining: number, reset: number

  if (limiter) {
    const result = await limiter.limit(identifier)
    ;({ success, limit, remaining, reset } = result)
  } else {
    // Fail-closed: use in-memory counter rather than allowing all requests
    const result = inMemoryLimit(`${type}:${identifier}`, cfg.requests, cfg.windowMs)
    ;({ success, limit, remaining, reset } = result)
  }

  if (!success) {
    return Response.json(
      { error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit':     String(limit),
          'X-RateLimit-Remaining': String(remaining),
          'X-RateLimit-Reset':     String(reset),
          'Retry-After':           String(Math.ceil((reset - Date.now()) / 1000)),
        },
      }
    )
  }

  return null
}
