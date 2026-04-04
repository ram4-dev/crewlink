import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'
import { apiError } from '@/lib/errors'

async function getAgentDetail(ctx: { userId: string }, agentId: string) {
  const supabase = createSupabaseAdmin()

  // 1. Fetch agent with ownership check
  const { data: agent } = await supabase
    .from('agents')
    .select('id, name, framework, is_active, rating_avg, ratings_count, contracts_completed_count, created_at')
    .eq('id', agentId)
    .eq('owner_user_id', ctx.userId)
    .single()

  if (!agent) return apiError('AGENT_NOT_FOUND', 'Agent not found', 404)

  // 2. Fetch all manifests (active and inactive for the owner)
  const { data: manifests } = await supabase
    .from('skill_manifests')
    .select('id, capability_description, pricing_model, tags, is_active, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })

  // 3. Fetch recent contracts (as hiring agent)
  const { data: hiringContracts } = await supabase
    .from('contracts')
    .select('id, budget_credits, status, rating, created_at, completed_at, hired_agent:agents!hired_agent_id(name), job:jobs(title)')
    .eq('hiring_agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(20)

  // 4. Fetch recent contracts (as hired agent)
  const { data: hiredContracts } = await supabase
    .from('contracts')
    .select('id, budget_credits, status, rating, created_at, completed_at, hiring_agent:agents!hiring_agent_id(name), job:jobs(title)')
    .eq('hired_agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(20)

  // 5. Merge, normalize, sort, take 20
  type ContractRow = {
    id: string; budget_credits: number; status: string; rating: number | null
    created_at: string; completed_at: string | null
    job: { title: string } | null
    hired_agent?: { name: string } | null
    hiring_agent?: { name: string } | null
  }

  const normalize = (rows: ContractRow[] | null, role: 'hiring' | 'hired') =>
    (rows ?? []).map((c) => ({
      id: c.id,
      job_title: c.job?.title ?? 'Unknown',
      counterpart_name: role === 'hiring'
        ? (c as ContractRow & { hired_agent: { name: string } | null }).hired_agent?.name ?? 'Unknown'
        : (c as ContractRow & { hiring_agent: { name: string } | null }).hiring_agent?.name ?? 'Unknown',
      role,
      budget_credits: c.budget_credits,
      status: c.status,
      rating: c.rating,
      created_at: c.created_at,
      completed_at: c.completed_at,
    }))

  const allContracts = [
    ...normalize(hiringContracts as ContractRow[] | null, 'hiring'),
    ...normalize(hiredContracts as ContractRow[] | null, 'hired'),
  ]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20)

  return Response.json({ agent, manifests: manifests ?? [], recent_contracts: allContracts })
}

async function toggleAgent(req: NextRequest, ctx: { userId: string }, agentId: string) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { is_active } = body as Record<string, unknown>
  if (typeof is_active !== 'boolean') return apiError('VALIDATION_ERROR', 'is_active must be a boolean', 400)

  const supabase = createSupabaseAdmin()

  const { data: agent } = await supabase
    .from('agents')
    .select('id, owner_user_id')
    .eq('id', agentId)
    .single()

  if (!agent) return apiError('AGENT_NOT_FOUND', 'Agent not found', 404)
  if (agent.owner_user_id !== ctx.userId) return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)

  if (!is_active) {
    // Block deactivation if agent has open contracts
    const { count } = await supabase
      .from('contracts')
      .select('id', { count: 'exact', head: true })
      .or(`hiring_agent_id.eq.${agentId},hired_agent_id.eq.${agentId}`)
      .in('status', ['pending_approval', 'active', 'disputed'])

    if (count && count > 0) {
      return apiError('AGENT_HAS_ACTIVE_CONTRACTS', 'Cannot deactivate agent with open contracts', 409, {
        open_contracts: count,
      })
    }
  }

  await supabase.from('agents').update({ is_active }).eq('id', agentId)
  return Response.json({ success: true })
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSessionAuth(async (_r, ctx) => {
    const { id } = await params
    return getAgentDetail(ctx, id)
  })(req)
}

export function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSessionAuth(async (r, ctx) => {
    const { id } = await params
    return toggleAgent(r, ctx, id)
  })(req)
}
