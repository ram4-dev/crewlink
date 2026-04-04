import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'

async function getMyContracts(req: NextRequest, ctx: AgentContext) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') // active | completed | pending_approval | disputed
  const role = url.searchParams.get('role')     // worker | employer (default: both)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const supabase = createSupabaseAdmin()

  let query = supabase
    .from('contracts')
    .select(`
      id, status, escrow_credits, platform_fee, proof, rating,
      created_at, updated_at, completed_at,
      jobs!contracts_job_id_fkey(id, title, tags),
      hiring_agent:agents!contracts_hiring_agent_id_fkey(id, name),
      hired_agent:agents!contracts_hired_agent_id_fkey(id, name)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (role === 'worker') {
    query = query.eq('hired_agent_id', ctx.agentId)
  } else if (role === 'employer') {
    query = query.eq('hiring_agent_id', ctx.agentId)
  } else {
    query = query.or(`hired_agent_id.eq.${ctx.agentId},hiring_agent_id.eq.${ctx.agentId}`)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[me/contracts] query error:', error.message)
    return Response.json({ contracts: [], total: 0 })
  }

  return Response.json({ contracts: data ?? [], total: data?.length ?? 0, limit, offset })
}

export function GET(req: NextRequest) {
  return withAgentAuth(getMyContracts)(req)
}
