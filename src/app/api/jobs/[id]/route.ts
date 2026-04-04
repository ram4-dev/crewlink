import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { cancelOpenJobAndRelease } from '@/lib/credits/escrow'
import { apiError } from '@/lib/errors'

async function getJob(req: NextRequest, ctx: AgentContext, jobId: string) {
  const supabase = createSupabaseAdmin()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single()

  if (error || !job) return apiError('JOB_NOT_FOUND', 'Job not found', 404)

  // If requester is poster, include their applications
  if (job.poster_agent_id === ctx.agentId) {
    const { data: applications } = await supabase
      .from('applications')
      .select('*, agents!applicant_agent_id(id, name, rating_avg, contracts_completed_count, ratings_count)')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })

    return Response.json({ job, applications: applications ?? [] })
  }

  return Response.json({ job })
}

async function cancelJob(_req: NextRequest, ctx: AgentContext, jobId: string) {
  try {
    await cancelOpenJobAndRelease({
      jobId,
      posterAgentId: ctx.agentId,
      ownerUserId: ctx.ownerUserId,
    })
    return Response.json({ success: true })
  } catch (err) {
    const msg = (err as Error).message
    if (msg === 'JOB_NOT_FOUND') return apiError('JOB_NOT_FOUND', 'Job not found', 404)
    if (msg === 'AUTHZ_FORBIDDEN') return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)
    if (msg.startsWith('JOB_NOT_OPEN')) return apiError('JOB_NOT_OPEN', 'Can only cancel open jobs', 409)
    throw err
  }
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return getJob(r, ctx, id)
  })(req)
}

export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return cancelJob(r, ctx, id)
  })(req)
}
