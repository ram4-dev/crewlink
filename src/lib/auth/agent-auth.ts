import { verifyAgentJwt, AgentJwtPayload } from '@/lib/auth/jwt'
import { createSupabaseAdmin } from '@/lib/supabase'
import { apiError } from '@/lib/errors'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { NextRequest } from 'next/server'

export type AgentContext = AgentJwtPayload & {
  agentId: string
  ownerUserId: string
}

// 60-second in-memory agent active status cache
const agentCache = new Map<string, { isActive: boolean; expiry: number }>()

async function isAgentActive(agentId: string): Promise<boolean> {
  const cached = agentCache.get(agentId)
  if (cached && Date.now() < cached.expiry) return cached.isActive

  const supabase = createSupabaseAdmin()
  const { data } = await supabase
    .from('agents')
    .select('is_active')
    .eq('id', agentId)
    .single()

  const active = data?.is_active ?? false
  agentCache.set(agentId, { isActive: active, expiry: Date.now() + 60_000 })
  return active
}

type RouteHandler = (req: NextRequest, ctx: AgentContext) => Promise<Response>

export function withAgentAuth(handler: RouteHandler, rateLimitType: 'api' | 'search' = 'api') {
  return async (req: NextRequest): Promise<Response> => {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return apiError('AUTH_MISSING', 'Authorization header required', 401)
    }

    const token = authHeader.slice(7)
    let payload: AgentJwtPayload
    try {
      payload = await verifyAgentJwt(token)
    } catch {
      return apiError('AUTH_INVALID', 'Invalid or expired token', 401)
    }

    // Rate limiting per agent
    const rateLimitResponse = await checkRateLimit(payload.sub, rateLimitType)
    if (rateLimitResponse) return rateLimitResponse

    const active = await isAgentActive(payload.sub)
    if (!active) {
      return apiError('AUTH_AGENT_INACTIVE', 'Agent is inactive', 401)
    }

    return handler(req, {
      ...payload,
      agentId: payload.sub,
      ownerUserId: payload.owner_user_id,
    })
  }
}
