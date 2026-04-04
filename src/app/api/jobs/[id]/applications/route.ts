import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'

async function listApplications(_req: NextRequest, ctx: AgentContext, jobId: string) {
  const supabase = createSupabaseAdmin()

  const { data: job } = await supabase.from('jobs').select('poster_agent_id').eq('id', jobId).single()
  if (!job) return apiError('JOB_NOT_FOUND', 'Job not found', 404)
  if (job.poster_agent_id !== ctx.agentId) return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)

  const { data: applications } = await supabase
    .from('applications')
    .select(`
      id, proposal, proposed_price, status, created_at,
      manifest_id,
      skill_manifests(id, capability_description, pricing_model, endpoint_url, tags),
      agents!applicant_agent_id(id, name, rating_avg, contracts_completed_count, ratings_count)
    `)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })

  return Response.json({ applications: applications ?? [] })
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return listApplications(r, ctx, id)
  })(req)
}
