import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { hireApplicationWithAdjustment, InsufficientCreditsError } from '@/lib/credits/escrow'
import { detectCycle } from '@/lib/jobs/depth-checker'
import { apiError } from '@/lib/errors'
import { insertInboxEvent } from '@/lib/inbox/insert-event'

async function hireApplicant(req: NextRequest, ctx: AgentContext, jobId: string) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { application_id } = body as Record<string, unknown>
  if (!application_id || typeof application_id !== 'string') {
    return apiError('VALIDATION_ERROR', 'application_id is required', 400)
  }

  const supabase = createSupabaseAdmin()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, poster_agent_id, status, budget_credits, depth_level')
    .eq('id', jobId)
    .single()

  if (!job) return apiError('JOB_NOT_FOUND', 'Job not found', 404)
  if (job.poster_agent_id !== ctx.agentId) return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)

  // Idempotent: return existing non-cancelled contract
  const { data: existingContract } = await supabase
    .from('contracts')
    .select('id, status')
    .eq('job_id', jobId)
    .not('status', 'eq', 'cancelled')
    .single()

  if (existingContract) {
    return Response.json({ contract_id: existingContract.id, contract_status: existingContract.status })
  }

  if (job.status !== 'open') return apiError('JOB_NOT_OPEN', 'Job is not open', 409)

  const { data: application } = await supabase
    .from('applications')
    .select('id, applicant_agent_id, proposed_price, manifest_id, status')
    .eq('id', application_id)
    .eq('job_id', jobId)
    .eq('status', 'pending')
    .single()

  if (!application) return apiError('APPLICATION_NOT_FOUND', 'Application not found', 404)

  // Cycle detection (app-layer; structural validation)
  const hasCycle = await detectCycle(ctx.agentId, application.applicant_agent_id, jobId)
  if (hasCycle) return apiError('CYCLE_DETECTED', 'Cycle detected in agent chain', 400)

  // Fetch manifest snapshot
  const { data: manifest } = await supabase
    .from('skill_manifests')
    .select('id, endpoint_url, pricing_model, input_schema, output_schema')
    .eq('id', application.manifest_id)
    .single()

  if (!manifest) return apiError('MANIFEST_NOT_FOUND', 'Manifest not found', 422)

  // Fetch owner for approval threshold
  const { data: owner } = await supabase
    .from('users')
    .select('approval_threshold')
    .eq('id', ctx.ownerUserId)
    .single()

  if (!owner) return apiError('INTERNAL_ERROR', 'Owner not found', 500)

  const approvedPrice  = parseFloat(String(application.proposed_price))
  const budgetCredits  = parseFloat(String(job.budget_credits))
  const contractStatus = approvedPrice > owner.approval_threshold ? 'pending_approval' : 'active'

  // Fetch other pending applicants BEFORE the atomic RPC changes their status
  const { data: otherApplicants } = await supabase
    .from('applications')
    .select('id, applicant_agent_id')
    .eq('job_id', jobId)
    .neq('id', application_id)
    .eq('status', 'pending')

  // Atomic: balance re-check (under lock) + contract insert + escrow adjustment +
  // job/application status updates — all in a single Postgres transaction
  try {
    const result = await hireApplicationWithAdjustment({
      jobId,
      applicationId:        application_id,
      hiringAgentId:        ctx.agentId,
      ownerUserId:          ctx.ownerUserId,
      approvedPrice,
      contractStatus:       contractStatus as 'active' | 'pending_approval',
      selectedManifestId:   manifest.id,
      selectedEndpointUrl:  manifest.endpoint_url,
      pricingModelSnapshot: manifest.pricing_model as object,
      inputSchemaSnapshot:  manifest.input_schema as object,
      outputSchemaSnapshot: manifest.output_schema as object,
    })

    // Inbox events: accepted for hired agent, rejected for others
    await insertInboxEvent(supabase, application.applicant_agent_id, 'application_accepted', {
      job_id: jobId,
      application_id: application_id,
      contract_id: result.contract_id,
      contract_status: result.contract_status,
    })

    for (const rejected of otherApplicants ?? []) {
      await insertInboxEvent(supabase, rejected.applicant_agent_id, 'application_rejected', {
        job_id: jobId,
        application_id: rejected.id,
      })
    }

    return Response.json(result)
  } catch (err) {
    const e = err as Error & { code?: string }
    if (err instanceof InsufficientCreditsError) {
      return apiError('INSUFFICIENT_CREDITS', err.message, 402, {
        required: approvedPrice - budgetCredits,
        available: 0,
      })
    }
    if (e.code === 'JOB_NOT_OPEN') return apiError('JOB_NOT_OPEN', 'Job is not open', 409)
    if (e.code === 'APPLICATION_NOT_FOUND') return apiError('APPLICATION_NOT_FOUND', 'Application not found', 404)
    return apiError('INTERNAL_ERROR', (err as Error).message, 500)
  }
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return hireApplicant(r, ctx, id)
  })(req)
}
