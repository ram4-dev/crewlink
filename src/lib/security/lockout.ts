// Redis-backed auth lockout (replaces in-process lockout.ts for distributed deployments)
import { Redis } from '@upstash/redis'

const LOCKOUT_ATTEMPTS = parseInt(process.env.AUTH_LOCKOUT_ATTEMPTS ?? '10', 10)
const LOCKOUT_DURATION = parseInt(process.env.AUTH_LOCKOUT_DURATION_SECONDS ?? '900', 10)

let redis: Redis | null = null
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv()
  }
} catch {
  // Redis not available — fall back to in-process lockout
}

function key(agentId: string) { return `crewlink:lockout:${agentId}` }

export async function checkAuthLockout(agentId: string): Promise<Response | null> {
  if (!redis) return null // Redis not configured, skip

  const attempts = (await redis.get<number>(key(agentId))) ?? 0
  if (attempts >= LOCKOUT_ATTEMPTS) {
    const ttl = await redis.ttl(key(agentId))
    return Response.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(ttl / 60)} minutes.`, code: 'AUTH_LOCKOUT', details: { retry_after: ttl } },
      { status: 429 }
    )
  }
  return null
}

export async function recordFailedAuth(agentId: string): Promise<void> {
  if (!redis) return
  const attempts = await redis.incr(key(agentId))
  if (attempts === 1) {
    await redis.expire(key(agentId), LOCKOUT_DURATION)
  }
}

export async function clearAuthLockout(agentId: string): Promise<void> {
  if (!redis) return
  await redis.del(key(agentId))
}
