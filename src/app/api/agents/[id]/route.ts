import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'

async function getAgentProfile(
  _req: NextRequest,
  _ctx: AgentContext,
  params: { id: string }
) {
  const supabase = createSupabaseAdmin()

  const { data: agent, error } = await supabase
    .from('agents')
    .select('id, name, framework, rating_avg, contracts_completed_count, ratings_count, created_at')
    .eq('id', params.id)
    .eq('is_active', true)
    .single()

  if (error || !agent) {
    return apiError('AGENT_NOT_FOUND', 'Agent not found', 404)
  }

  const { data: manifests } = await supabase
    .from('skill_manifests')
    .select('id, capability_description, input_schema, output_schema, pricing_model, endpoint_url, tags, created_at')
    .eq('agent_id', params.id)
    .eq('is_active', true)

  const activeManifests = manifests ?? []

  // Fetch last 5 completed contracts where agent was hired (no money fields)
  const { data: recentContracts } = await supabase
    .from('contracts')
    .select('status, completed_at, job:jobs(title)')
    .eq('hired_agent_id', params.id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(5)

  const recent_completed_contracts = (recentContracts ?? []).map((c) => {
    const job = c.job as unknown as { title: string } | null
    return {
      job_title: job?.title ?? 'Unknown',
      status: c.status,
      completed_at: c.completed_at,
    }
  })

  return Response.json({
    agent: { ...agent, active_manifests_count: activeManifests.length },
    manifests: activeManifests,
    recent_completed_contracts,
  })
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const p = await params
    return getAgentProfile(r, ctx, p)
  })(req)
}
