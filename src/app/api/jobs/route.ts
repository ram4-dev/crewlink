import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { createJobWithEscrow, InsufficientCreditsError } from '@/lib/credits/escrow'
import { calculateDepthLevel, checkMaxDepth } from '@/lib/jobs/depth-checker'
import { apiError } from '@/lib/errors'

async function createJob(req: NextRequest, ctx: AgentContext) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const {
    title, description, budget_credits, deadline,
    tags, required_input_schema, expected_output_schema,
    parent_contract_id,
  } = body as Record<string, unknown>

  if (!title || typeof title !== 'string') return apiError('VALIDATION_ERROR', 'title is required', 400)
  if (!description || typeof description !== 'string') return apiError('VALIDATION_ERROR', 'description is required', 400)
  if (typeof budget_credits !== 'number' || budget_credits <= 0) return apiError('VALIDATION_ERROR', 'budget_credits must be a positive number', 400)

  // Calculate depth and validate (app-layer; RPC re-validates balance under lock)
  let depthLevel: number
  try {
    depthLevel = await calculateDepthLevel(
      ctx.agentId,
      typeof parent_contract_id === 'string' ? parent_contract_id : null
    )
  } catch (err) {
    const e = err as Error & { code?: string }
    if (e.code === 'FORBIDDEN') return apiError('AUTHZ_FORBIDDEN', e.message, 403)
    return apiError('VALIDATION_ERROR', e.message, 400)
  }

  try {
    checkMaxDepth(depthLevel)
  } catch (err) {
    const e = err as Error & { code?: string; depth?: number; max?: number }
    return apiError('CHAIN_DEPTH_EXCEEDED', e.message, 400, { depth: e.depth, max: e.max })
  }

  // Atomic: balance check + job insert + escrow hold in one Postgres transaction
  try {
    const job = await createJobWithEscrow({
      posterAgentId:        ctx.agentId,
      ownerUserId:          ctx.ownerUserId,
      title,
      description,
      budgetCredits:        budget_credits as number,
      deadline:             typeof deadline === 'string' ? deadline : null,
      tags:                 Array.isArray(tags) ? (tags as string[]) : [],
      requiredInputSchema:  required_input_schema as object ?? null,
      expectedOutputSchema: expected_output_schema as object ?? null,
      depthLevel,
      parentContractId:     typeof parent_contract_id === 'string' ? parent_contract_id : null,
    })
    return Response.json(job, { status: 201 })
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return apiError('INSUFFICIENT_CREDITS', err.message, 402, {
        required: budget_credits,
        available: 0,
      })
    }
    return apiError('INTERNAL_ERROR', (err as Error).message, 500)
  }
}

async function listJobs(req: NextRequest, ctx: AgentContext) {
  const url = new URL(req.url)
  const tagsParam = url.searchParams.get('tags')
  const tags = tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : null
  const budgetMin = url.searchParams.get('budget_min') ? parseFloat(url.searchParams.get('budget_min')!) : null
  const budgetMax = url.searchParams.get('budget_max') ? parseFloat(url.searchParams.get('budget_max')!) : null
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const supabase = createSupabaseAdmin()

  let query = supabase
    .from('jobs')
    .select('*', { count: 'exact' })
    .eq('status', 'open')
    .neq('poster_agent_id', ctx.agentId)
    .or('deadline.is.null,deadline.gt.' + new Date().toISOString())

  if (tags && tags.length > 0) query = query.contains('tags', tags)
  if (budgetMin !== null) query = query.gte('budget_credits', budgetMin)
  if (budgetMax !== null) query = query.lte('budget_credits', budgetMax)

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return apiError('INTERNAL_ERROR', 'Failed to list jobs', 500)

  return Response.json({ jobs: data ?? [], total: count ?? 0, limit, offset })
}

export function POST(req: NextRequest) {
  return withAgentAuth(createJob)(req)
}

export function GET(req: NextRequest) {
  return withAgentAuth(listJobs)(req)
}
