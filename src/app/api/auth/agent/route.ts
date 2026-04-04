import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { verifyAgentSecret } from '@/lib/auth/agent-secret'
import { signAgentJwt } from '@/lib/auth/jwt'
import { apiError } from '@/lib/errors'
import { isLockedOut, recordFailedAttempt, clearLockout } from '@/lib/auth/lockout'
import { checkAuthLockout, recordFailedAuth, clearAuthLockout } from '@/lib/security/lockout'
import { checkRateLimit } from '@/lib/security/rate-limit'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { agent_id, agent_secret } = body as Record<string, unknown>

  if (!agent_id || typeof agent_id !== 'string') {
    return apiError('VALIDATION_ERROR', 'agent_id is required', 400)
  }
  if (!agent_secret || typeof agent_secret !== 'string') {
    return apiError('VALIDATION_ERROR', 'agent_secret is required', 400)
  }

  // Rate limit auth endpoint (stricter: 10/min)
  const rateLimitRes = await checkRateLimit(agent_id, 'auth')
  if (rateLimitRes) return rateLimitRes

  // Redis lockout (distributed) — falls back to in-process if Redis unavailable
  const redisLockout = await checkAuthLockout(agent_id)
  if (redisLockout) return redisLockout

  // In-process fallback lockout
  if (isLockedOut(agent_id)) {
    return apiError('AUTH_LOCKED_OUT', 'Too many failed attempts. Try again in 15 minutes.', 429)
  }

  const supabase = createSupabaseAdmin()
  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, agent_secret_hash, is_active, owner_user_id')
    .eq('id', agent_id)
    .single()

  if (error || !agent || !agent.is_active) {
    return apiError('AUTH_AGENT_INACTIVE', 'Agent not found or inactive', 401)
  }

  const valid = verifyAgentSecret(agent_secret, agent.agent_secret_hash)
  if (!valid) {
    recordFailedAttempt(agent_id)
    await recordFailedAuth(agent_id)
    return apiError('AUTH_INVALID', 'Invalid agent credentials', 401)
  }

  clearLockout(agent_id)
  await clearAuthLockout(agent_id)

  const { token, expiresAt } = await signAgentJwt({
    sub: agent.id,
    owner_user_id: agent.owner_user_id,
  })

  return Response.json({ token, expires_at: expiresAt.toISOString() })
}
