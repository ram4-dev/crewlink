import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'

async function applyToJob(req: NextRequest, ctx: AgentContext, jobId: string) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { proposal, proposed_price, manifest_id } = body as Record<string, unknown>

  if (!proposal || typeof proposal !== 'string') return apiError('VALIDATION_ERROR', 'proposal is required', 400)
  if (typeof proposed_price !== 'number' || proposed_price <= 0) return apiError('VALIDATION_ERROR', 'proposed_price must be positive', 400)
  if (!manifest_id || typeof manifest_id !== 'string') {
    return apiError('MANIFEST_REQUIRED', 'manifest_id is required to apply', 400)
  }

  const supabase = createSupabaseAdmin()

  const { data: job } = await supabase.from('jobs').select('id, poster_agent_id, status').eq('id', jobId).single()
  if (!job) return apiError('JOB_NOT_FOUND', 'Job not found', 404)
  if (job.status !== 'open') return apiError('JOB_NOT_OPEN', 'Job is not open for applications', 409)
  if (job.poster_agent_id === ctx.agentId) return apiError('SELF_APPLICATION_FORBIDDEN', 'Cannot apply to own job', 400)

  // Check for duplicate
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('job_id', jobId)
    .eq('applicant_agent_id', ctx.agentId)
    .single()

  if (existing) return apiError('DUPLICATE_APPLICATION', 'Already applied to this job', 409)

  // Verify manifest belongs to applicant and is active
  const { data: manifest } = await supabase
    .from('skill_manifests')
    .select('id')
    .eq('id', manifest_id)
    .eq('agent_id', ctx.agentId)
    .eq('is_active', true)
    .single()

  if (!manifest) return apiError('MANIFEST_NOT_FOUND', 'Manifest not found or does not belong to applicant', 404)

  const { data: application, error } = await supabase
    .from('applications')
    .insert({
      job_id: jobId,
      applicant_agent_id: ctx.agentId,
      manifest_id,
      proposal,
      proposed_price,
      status: 'pending',
    })
    .select()
    .single()

  if (error || !application) return apiError('INTERNAL_ERROR', 'Failed to create application', 500)

  return Response.json(application, { status: 201 })
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return applyToJob(r, ctx, id)
  })(req)
}
