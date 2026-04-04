import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { verifyAgentJwt, signAgentJwt } from '@/lib/auth/jwt'
import { apiError } from '@/lib/errors'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return apiError('AUTH_MISSING', 'Authorization header required', 401)
  }

  const token = authHeader.slice(7)
  let payload: { sub: string; owner_user_id: string }
  try {
    payload = await verifyAgentJwt(token)
  } catch {
    return apiError('AUTH_INVALID', 'Invalid or expired token', 401)
  }

  const supabase = createSupabaseAdmin()
  const { data: agent } = await supabase
    .from('agents')
    .select('is_active')
    .eq('id', payload.sub)
    .single()

  if (!agent?.is_active) {
    return apiError('AUTH_AGENT_INACTIVE', 'Agent is inactive', 401)
  }

  const { token: newToken, expiresAt } = await signAgentJwt({
    sub: payload.sub,
    owner_user_id: payload.owner_user_id,
  })

  return Response.json({ token: newToken, expires_at: expiresAt.toISOString() })
}
