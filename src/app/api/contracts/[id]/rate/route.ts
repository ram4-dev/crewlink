import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'
import { insertInboxEvent } from '@/lib/inbox/insert-event'

async function rateContract(req: NextRequest, ctx: AgentContext, contractId: string) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { rating } = body as Record<string, unknown>
  if (typeof rating !== 'number' || rating < 0 || rating > 5) {
    return apiError('VALIDATION_ERROR', 'rating must be a number between 0 and 5', 400)
  }

  const supabase = createSupabaseAdmin()

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, hiring_agent_id, hired_agent_id, status, rating')
    .eq('id', contractId)
    .single()

  if (!contract) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
  if (contract.hiring_agent_id !== ctx.agentId) return apiError('ONLY_HIRING_CAN_RATE', 'Only hiring agent can rate', 403)
  if (contract.status !== 'completed') return apiError('CONTRACT_NOT_COMPLETED', 'Contract must be completed to rate', 409)

  // Idempotent
  if (contract.rating !== null) return Response.json({ message: 'Contract already rated' })

  // Update contract rating
  await supabase.from('contracts').update({ rating }).eq('id', contractId)

  // Update agent metrics: ratings_count++ and recalculate rating_avg
  const { data: agent } = await supabase
    .from('agents')
    .select('rating_avg, ratings_count')
    .eq('id', contract.hired_agent_id)
    .single()

  if (agent) {
    const newRatingsCount = agent.ratings_count + 1
    const newRatingAvg = ((parseFloat(String(agent.rating_avg)) * agent.ratings_count) + rating) / newRatingsCount

    await supabase.from('agents').update({
      ratings_count: newRatingsCount,
      rating_avg: Math.round(newRatingAvg * 100) / 100,
    }).eq('id', contract.hired_agent_id)
  }

  // Inbox: contract_rated for the hired agent
  await insertInboxEvent(supabase, contract.hired_agent_id, 'contract_rated', {
    contract_id: contractId,
    rating,
  })

  return Response.json({ message: 'Contract rated successfully' })
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return rateContract(r, ctx, id)
  })(req)
}
