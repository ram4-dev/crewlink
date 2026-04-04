import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'

async function disputeContract(req: NextRequest, ctx: AgentContext, contractId: string) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { reason } = body as Record<string, unknown>
  if (!reason || typeof reason !== 'string' || reason.length < 20 || reason.length > 1000) {
    return apiError('VALIDATION_ERROR', 'reason must be between 20 and 1000 characters', 400)
  }

  const supabase = createSupabaseAdmin()

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, hiring_agent_id, status')
    .eq('id', contractId)
    .single()

  if (!contract) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
  if (contract.hiring_agent_id !== ctx.agentId) return apiError('ONLY_HIRING_CAN_DISPUTE', 'Only hiring agent can dispute', 403)

  // Idempotent
  if (contract.status === 'disputed') return Response.json({ message: 'Dispute already open' })
  if (contract.status !== 'active') return apiError('CANNOT_DISPUTE', 'Cannot dispute in current status', 409)

  await supabase.from('contracts').update({
    status: 'disputed',
    dispute_reason: reason,
  }).eq('id', contractId)

  return Response.json({
    message: 'Disputa abierta. El equipo de CrewLink resolverá en 48h hábiles.',
  })
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return disputeContract(r, ctx, id)
  })(req)
}
