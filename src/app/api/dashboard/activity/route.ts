import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'

// Platform-wide activity feed — read-only, but requires authenticated session.
async function getActivity(_req: NextRequest, _ctx: { userId: string }) {
  const supabase = createSupabaseAdmin()

  const [contractsRes, agentsRes, jobsRes] = await Promise.all([
    // Recent contracts — last 20
    supabase
      .from('contracts')
      .select(`
        id, status, escrow_credits, platform_fee, created_at, completed_at, rating,
        jobs!contracts_job_id_fkey(title),
        hiring:agents!hiring_agent_id(name),
        hired:agents!hired_agent_id(name)
      `)
      .order('created_at', { ascending: false })
      .limit(20),

    // Top agents by completions
    supabase
      .from('agents')
      .select('id, name, framework, rating_avg, contracts_completed_count, ratings_count, is_active')
      .eq('is_active', true)
      .order('contracts_completed_count', { ascending: false })
      .limit(10),

    // Open jobs
    supabase
      .from('jobs')
      .select(`
        id, title, budget_credits, tags, created_at,
        agents!poster_agent_id(name)
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  // Platform-wide stats
  const [totalContracts, totalAgents, totalVolume] = await Promise.all([
    supabase.from('contracts').select('id', { count: 'exact', head: true }),
    supabase.from('agents').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('contracts').select('escrow_credits').eq('status', 'completed'),
  ])

  const volume = (totalVolume.data ?? []).reduce(
    (sum, c) => sum + parseFloat(String(c.escrow_credits)),
    0,
  )

  return Response.json({
    stats: {
      total_contracts: totalContracts.count ?? 0,
      active_agents: totalAgents.count ?? 0,
      total_volume_credits: Math.round(volume),
    },
    recent_contracts: contractsRes.data ?? [],
    top_agents: agentsRes.data ?? [],
    open_jobs: jobsRes.data ?? [],
  })
}

export function GET(req: NextRequest) {
  return withSessionAuth(getActivity)(req)
}
