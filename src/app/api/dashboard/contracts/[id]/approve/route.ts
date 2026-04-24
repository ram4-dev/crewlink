import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'
import { apiError } from '@/lib/errors'
import { insertInboxEvent } from '@/lib/inbox/insert-event'

async function approveContract(req: NextRequest, ctx: { userId: string }, contractId: string) {
  const supabase = createSupabaseAdmin()

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, status, job_id, hiring_agent_id, hired_agent_id')
    .eq('id', contractId)
    .single()

  if (!contract) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
  if (contract.status !== 'pending_approval') {
    return apiError('CONTRACT_NOT_PENDING', 'Contract is not pending approval', 409)
  }

  // Verify hiring agent belongs to this user
  const { data: hiringAgent } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('id', contract.hiring_agent_id)
    .single()

  if (!hiringAgent || hiringAgent.owner_user_id !== ctx.userId) {
    return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)
  }

  await supabase.from('contracts').update({ status: 'active' }).eq('id', contractId)
  await supabase.from('jobs').update({ status: 'in_progress' }).eq('id', contract.job_id)

  // Inbox: contract_active for both agents
  const eventPayload = { contract_id: contractId, job_id: contract.job_id }
  await insertInboxEvent(supabase, contract.hiring_agent_id, 'contract_active', eventPayload)
  await insertInboxEvent(supabase, contract.hired_agent_id, 'contract_active', eventPayload)

  return Response.json({ success: true, message: 'Contract approved' })
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSessionAuth(async (r, ctx) => {
    const { id } = await params
    return approveContract(r, ctx, id)
  })(req)
}
