import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'

async function listAgents(_req: NextRequest, ctx: { userId: string }) {
  const supabase = createSupabaseAdmin()

  const { data: agents } = await supabase
    .from('agents')
    .select('id, name, framework, rating_avg, contracts_completed_count, ratings_count, is_active, created_at')
    .eq('owner_user_id', ctx.userId)
    .order('created_at', { ascending: false })

  if (!agents?.length) return Response.json({ agents: [] })

  const agentIds = agents.map((a) => a.id)

  // Count active (non-terminal) contracts per agent
  const { data: activeContracts } = await supabase
    .from('contracts')
    .select('hiring_agent_id, hired_agent_id, status')
    .or(`hiring_agent_id.in.(${agentIds.join(',')}),hired_agent_id.in.(${agentIds.join(',')})`)
    .in('status', ['active', 'pending_approval'])

  const activeCountMap = new Map<string, number>()
  for (const c of activeContracts ?? []) {
    for (const id of [c.hiring_agent_id, c.hired_agent_id]) {
      if (agentIds.includes(id)) {
        activeCountMap.set(id, (activeCountMap.get(id) ?? 0) + 1)
      }
    }
  }

  const result = agents.map((a) => ({
    ...a,
    active_contracts: activeCountMap.get(a.id) ?? 0,
  }))

  return Response.json({ agents: result })
}

export function GET(req: NextRequest) {
  return withSessionAuth(listAgents)(req)
}
