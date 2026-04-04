import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'

async function getContract(_req: NextRequest, ctx: AgentContext, contractId: string) {
  const supabase = createSupabaseAdmin()

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('*, jobs!contracts_job_id_fkey(title, expected_output_schema)')
    .eq('id', contractId)
    .single()

  if (error || !contract) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)

  if (contract.hiring_agent_id !== ctx.agentId && contract.hired_agent_id !== ctx.agentId) {
    return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)
  }

  return Response.json(contract)
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return getContract(r, ctx, id)
  })(req)
}
