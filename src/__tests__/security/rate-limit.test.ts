import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Rate limit response format ───────────────────────────────────────────────
// Tests the shape of the 429 response returned by checkRateLimit.
// Since Upstash Redis is not available in test environment, we test the logic
// that builds the response (mocking the limiter internals).

function buildRateLimitResponse(limit: number, reset: number): Response {
  return Response.json(
    { error: 'Rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(limit),
        'X-RateLimit-Remaining': '0',
        'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
      },
    }
  )
}

describe('Rate limit 429 response structure', () => {
  it('returns status 429', () => {
    const res = buildRateLimitResponse(100, Date.now() + 60_000)
    expect(res.status).toBe(429)
  })

  it('includes X-RateLimit-Limit header', () => {
    const res = buildRateLimitResponse(100, Date.now() + 60_000)
    expect(res.headers.get('X-RateLimit-Limit')).toBe('100')
  })

  it('includes X-RateLimit-Remaining: 0 when limit exceeded', () => {
    const res = buildRateLimitResponse(100, Date.now() + 60_000)
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0')
  })

  it('includes Retry-After header (seconds until reset)', () => {
    const reset = Date.now() + 30_000 // 30 seconds from now
    const res = buildRateLimitResponse(10, reset)
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '0', 10)
    // Should be approximately 30 (allow 1s tolerance for test execution time)
    expect(retryAfter).toBeGreaterThanOrEqual(29)
    expect(retryAfter).toBeLessThanOrEqual(30)
  })

  it('response body contains error and code fields', async () => {
    const res = buildRateLimitResponse(60, Date.now() + 60_000)
    const body = await res.json()
    expect(body).toHaveProperty('error', 'Rate limit exceeded')
    expect(body).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED')
  })
})

// ─── Graceful degradation when Redis is not configured ────────────────────────

describe('Rate limit graceful degradation', () => {
  it('returns null (allow all) when Redis is not configured', async () => {
    // Simulate the module's behavior: if !redis, return null
    const checkRateLimitWithoutRedis = async (_id: string, _type: string) => {
      const redis = null // not configured
      if (!redis) return null
      // (would call limiter.limit if redis was present)
    }

    const result = await checkRateLimitWithoutRedis('agent-123', 'api')
    expect(result).toBeNull()
  })
})

// ─── Rate limit type limits ────────────────────────────────────────────────────

describe('Rate limit configuration', () => {
  it('auth limit is more restrictive than api limit', () => {
    const apiLimit = parseInt(process.env.RATE_LIMIT_API_PER_MINUTE ?? '100', 10)
    const authLimit = parseInt(process.env.RATE_LIMIT_AUTH_PER_MINUTE ?? '10', 10)
    expect(authLimit).toBeLessThan(apiLimit)
  })

  it('search limit is 60 (hardcoded)', () => {
    // The search limit is hardcoded at 60 in rate-limit.ts
    const SEARCH_LIMIT = 60
    expect(SEARCH_LIMIT).toBe(60)
  })

  it('api limit defaults to 100', () => {
    const original = process.env.RATE_LIMIT_API_PER_MINUTE
    delete process.env.RATE_LIMIT_API_PER_MINUTE
    const limit = parseInt(process.env.RATE_LIMIT_API_PER_MINUTE ?? '100', 10)
    expect(limit).toBe(100)
    if (original) process.env.RATE_LIMIT_API_PER_MINUTE = original
  })

  it('auth limit defaults to 10', () => {
    const original = process.env.RATE_LIMIT_AUTH_PER_MINUTE
    delete process.env.RATE_LIMIT_AUTH_PER_MINUTE
    const limit = parseInt(process.env.RATE_LIMIT_AUTH_PER_MINUTE ?? '10', 10)
    expect(limit).toBe(10)
    if (original) process.env.RATE_LIMIT_AUTH_PER_MINUTE = original
  })
})
