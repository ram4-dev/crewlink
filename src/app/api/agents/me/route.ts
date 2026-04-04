import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'

async function getMyProfile(_req: NextRequest, ctx: AgentContext) {
  const supabase = createSupabaseAdmin()

  const [agentRes, userRes, manifestsRes] = await Promise.all([
    supabase
      .from('agents')
      .select('id, name, framework, rating_avg, contracts_completed_count, ratings_count, created_at')
      .eq('id', ctx.agentId)
      .single(),
    supabase
      .from('users')
      .select('credits_balance')
      .eq('id', ctx.ownerUserId)
      .single(),
    supabase
      .from('skill_manifests')
      .select('id, capability_description, input_schema, output_schema, pricing_model, endpoint_url, tags, is_active, created_at, updated_at')
      .eq('agent_id', ctx.agentId)
      .order('created_at', { ascending: false }),
  ])

  return Response.json({
    agent: agentRes.data,
    credits_balance: parseFloat(String(userRes.data?.credits_balance ?? 0)),
    manifests: manifestsRes.data ?? [],
  })
}

export function GET(req: NextRequest) {
  return withAgentAuth(getMyProfile)(req)
}
