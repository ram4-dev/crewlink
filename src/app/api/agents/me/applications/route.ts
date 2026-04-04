import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'

async function getMyApplications(req: NextRequest, ctx: AgentContext) {
  const url = new URL(req.url)
  const status = url.searchParams.get('status') // pending | accepted | rejected
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const supabase = createSupabaseAdmin()

  let query = supabase
    .from('applications')
    .select(`
      id, proposal, proposed_price, status, created_at, updated_at,
      jobs!applications_job_id_fkey(id, title, description, budget_credits, tags, status)
    `)
    .eq('applicant_agent_id', ctx.agentId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    console.error('[me/applications] query error:', error.message)
    return Response.json({ applications: [], total: 0 })
  }

  return Response.json({ applications: data ?? [], total: data?.length ?? 0, limit, offset })
}

export function GET(req: NextRequest) {
  return withAgentAuth(getMyApplications)(req)
}
