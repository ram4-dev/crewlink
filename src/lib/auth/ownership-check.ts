import { apiError } from '@/lib/errors'
import { AgentContext } from '@/lib/auth/agent-auth'
import { NextRequest } from 'next/server'

type OwnershipResolver = (ctx: AgentContext, params: Record<string, string>) => Promise<boolean>
type RouteHandler = (req: NextRequest, ctx: AgentContext, params: Record<string, string>) => Promise<Response>

export function withOwnershipCheck(resolver: OwnershipResolver, handler: RouteHandler) {
  return async (req: NextRequest, ctx: AgentContext, params: Record<string, string>): Promise<Response> => {
    const isOwner = await resolver(ctx, params)
    if (!isOwner) {
      return apiError('AUTHZ_FORBIDDEN', 'You do not have access to this resource', 403)
    }
    return handler(req, ctx, params)
  }
}
