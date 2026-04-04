import { createSupabaseAdmin } from '@/lib/supabase'

// All financial operations use Supabase RPC functions for atomic execution.
// RPCs are defined in migration 016_atomic_rpcs.sql.
// Each RPC acquires the necessary row locks and performs all ledger writes
// in a single Postgres transaction — no partial state is possible.

export class InsufficientCreditsError extends Error {
  constructor(available: number, required: number) {
    super(`Insufficient credits: ${available} available, ${required} required`)
    this.name = 'InsufficientCreditsError'
  }
}

function parseRpcError(message: string): Error {
  if (message.includes('INSUFFICIENT_CREDITS')) return new InsufficientCreditsError(0, 0)
  if (message.includes('USER_NOT_FOUND')) return new Error('USER_NOT_FOUND')
  if (message.includes('JOB_NOT_OPEN')) return Object.assign(new Error('JOB_NOT_OPEN'), { code: 'JOB_NOT_OPEN' })
  if (message.includes('APPLICATION_NOT_FOUND')) return Object.assign(new Error('APPLICATION_NOT_FOUND'), { code: 'APPLICATION_NOT_FOUND' })
  if (message.includes('CONTRACT_NOT_FOUND')) return Object.assign(new Error('CONTRACT_NOT_FOUND'), { code: 'CONTRACT_NOT_FOUND' })
  if (message.includes('CONTRACT_AWAITING_APPROVAL')) return Object.assign(new Error('CONTRACT_AWAITING_APPROVAL'), { code: 'CONTRACT_AWAITING_APPROVAL' })
  if (message.includes('CONTRACT_NOT_ACTIVE')) return Object.assign(new Error('CONTRACT_NOT_ACTIVE'), { code: 'CONTRACT_NOT_ACTIVE' })
  if (message.includes('CONTRACT_NOT_PENDING')) return Object.assign(new Error('CONTRACT_NOT_PENDING'), { code: 'CONTRACT_NOT_PENDING' })
  if (message.includes('AUTHZ_FORBIDDEN')) return Object.assign(new Error('AUTHZ_FORBIDDEN'), { code: 'AUTHZ_FORBIDDEN' })
  return new Error(message)
}

// F1: Create a job and hold escrow atomically.
// Returns the full job row as a plain object.
export async function createJobWithEscrow(params: {
  posterAgentId: string
  ownerUserId: string
  title: string
  description: string
  budgetCredits: number
  deadline?: string | null
  tags?: string[]
  requiredInputSchema?: object | null
  expectedOutputSchema?: object | null
  depthLevel?: number
  parentContractId?: string | null
}): Promise<Record<string, unknown>> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.rpc('create_job_with_escrow', {
    p_poster_agent_id:        params.posterAgentId,
    p_owner_user_id:          params.ownerUserId,
    p_title:                  params.title,
    p_description:            params.description,
    p_budget_credits:         params.budgetCredits,
    p_deadline:               params.deadline ?? null,
    p_tags:                   params.tags ?? [],
    p_required_input_schema:  params.requiredInputSchema ?? null,
    p_expected_output_schema: params.expectedOutputSchema ?? null,
    p_depth_level:            params.depthLevel ?? 1,
    p_parent_contract_id:     params.parentContractId ?? null,
  })

  if (error) throw parseRpcError(error.message)
  return data as Record<string, unknown>
}

// F2: Hire an applicant with atomic escrow adjustment (only the diff).
// Returns { contract_id, contract_status }.
export async function hireApplicationWithAdjustment(params: {
  jobId: string
  applicationId: string
  hiringAgentId: string
  ownerUserId: string
  approvedPrice: number
  contractStatus: 'active' | 'pending_approval'
  selectedManifestId: string
  selectedEndpointUrl: string
  pricingModelSnapshot: object
  inputSchemaSnapshot: object
  outputSchemaSnapshot: object
}): Promise<{ contract_id: string; contract_status: string }> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.rpc('hire_application_with_adjustment', {
    p_job_id:                 params.jobId,
    p_application_id:         params.applicationId,
    p_hiring_agent_id:        params.hiringAgentId,
    p_owner_user_id:          params.ownerUserId,
    p_approved_price:         params.approvedPrice,
    p_contract_status:        params.contractStatus,
    p_selected_manifest_id:   params.selectedManifestId,
    p_selected_endpoint_url:  params.selectedEndpointUrl,
    p_pricing_model_snapshot: params.pricingModelSnapshot,
    p_input_schema_snapshot:  params.inputSchemaSnapshot,
    p_output_schema_snapshot: params.outputSchemaSnapshot,
  })

  if (error) throw parseRpcError(error.message)
  return data as { contract_id: string; contract_status: string }
}

// F3: Complete a contract and settle payment atomically.
// Returns 'completed' or 'already_completed'.
export async function completeContractAndSettle(params: {
  contractId: string
  hiredUserId: string
  hiredAgentId: string
  platformFee: number
  proof: unknown
  proofWarning?: string | null
}): Promise<'completed' | 'already_completed'> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.rpc('complete_contract_and_settle', {
    p_contract_id:    params.contractId,
    p_hired_user_id:  params.hiredUserId,
    p_hired_agent_id: params.hiredAgentId,
    p_platform_fee:   params.platformFee,
    p_proof:          params.proof,
    p_proof_warning:  params.proofWarning ?? null,
  })

  if (error) throw parseRpcError(error.message)
  return data as 'completed' | 'already_completed'
}

// F4: Reject a pending contract and release escrow atomically.
// Ownership verification (hiring agent owner = userId) is done inside the RPC.
export async function rejectPendingContractAndRelease(params: {
  contractId: string
  userId: string
}): Promise<void> {
  const supabase = createSupabaseAdmin()
  const { error } = await supabase.rpc('reject_pending_contract_and_release', {
    p_contract_id: params.contractId,
    p_user_id:     params.userId,
  })

  if (error) throw parseRpcError(error.message)
}

// F5: Process a Stripe topup idempotently and atomically.
// Returns true if credits were applied, false if already processed.
export async function processStripeTopupOnce(params: {
  userId: string
  creditsAmount: number
  stripeSessionId: string
  description?: string
}): Promise<boolean> {
  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase.rpc('process_stripe_topup_once', {
    p_user_id:           params.userId,
    p_credits_amount:    params.creditsAmount,
    p_stripe_session_id: params.stripeSessionId,
    p_description:       params.description ?? null,
  })

  if (error) {
    if (error.message.includes('USER_NOT_FOUND')) throw new Error('User not found')
    throw new Error(`process_stripe_topup_once failed: ${error.message}`)
  }
  return data as boolean
}

// F4b: Cancel an open job and release escrow atomically.
export async function cancelOpenJobAndRelease(params: {
  jobId: string
  posterAgentId: string
  ownerUserId: string
}): Promise<void> {
  const supabase = createSupabaseAdmin()
  const { error } = await supabase.rpc('cancel_open_job_and_release', {
    p_job_id: params.jobId,
    p_poster_agent_id: params.posterAgentId,
    p_owner_user_id: params.ownerUserId,
  })

  if (error) throw parseRpcError(error.message)
}

// Legacy helpers — kept for backward compatibility with existing tests.
// New code should use the atomic functions above.

export async function holdJobEscrow(userId: string, jobId: string, amount: number): Promise<void> {
  const supabase = createSupabaseAdmin()
  const { data: user } = await supabase
    .from('users')
    .select('credits_balance')
    .eq('id', userId)
    .single()

  if (!user || parseFloat(String(user.credits_balance)) < amount) {
    throw new InsufficientCreditsError(parseFloat(String(user?.credits_balance ?? 0)), amount)
  }

  const { error } = await supabase.rpc('hold_job_escrow', {
    p_user_id: userId,
    p_job_id: jobId,
    p_amount: amount,
  })

  if (error) {
    if (error.message.includes('credits_balance')) throw new InsufficientCreditsError(0, amount)
    throw new Error(`holdJobEscrow failed: ${error.message}`)
  }
}

export async function adjustEscrowForHire(
  userId: string,
  jobId: string,
  oldAmount: number,
  newAmount: number
): Promise<void> {
  if (oldAmount === newAmount) return
  const supabase = createSupabaseAdmin()
  const diff = newAmount - oldAmount
  if (diff > 0) {
    const { data: user } = await supabase.from('users').select('credits_balance').eq('id', userId).single()
    if (!user || parseFloat(String(user.credits_balance)) < diff) {
      throw new InsufficientCreditsError(parseFloat(String(user?.credits_balance ?? 0)), diff)
    }
  }
  const { error } = await supabase.rpc('adjust_escrow', {
    p_user_id: userId, p_job_id: jobId, p_old_amount: oldAmount, p_new_amount: newAmount,
  })
  if (error) throw new Error(`adjustEscrowForHire failed: ${error.message}`)
}

export async function settleCompletedContract(
  contractId: string,
  hiringUserId: string,
  hiredUserId: string,
  amount: number,
  fee: number
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const { error } = await supabase.rpc('settle_contract', {
    p_contract_id: contractId, p_hiring_user_id: hiringUserId,
    p_hired_user_id: hiredUserId, p_amount: amount, p_fee: fee,
  })
  if (error) throw new Error(`settleCompletedContract failed: ${error.message}`)
}

export async function releaseJobEscrow(userId: string, jobId: string, amount: number): Promise<void> {
  const supabase = createSupabaseAdmin()
  const { error } = await supabase.rpc('release_job_escrow', {
    p_user_id: userId, p_job_id: jobId, p_amount: amount,
  })
  if (error) throw new Error(`releaseJobEscrow failed: ${error.message}`)
}

export async function releaseContractEscrowOnReject(
  userId: string,
  contractId: string,
  amount: number
): Promise<void> {
  const supabase = createSupabaseAdmin()
  const { data: user } = await supabase.from('users').select('credits_balance').eq('id', userId).single()
  if (!user) throw new Error('User not found')
  const newBalance = parseFloat(String(user.credits_balance)) + amount
  const { error: updateError } = await supabase.from('users').update({ credits_balance: newBalance }).eq('id', userId)
  if (updateError) throw new Error(`Balance update failed: ${updateError.message}`)
  const { error: txError } = await supabase.from('credit_transactions').insert({
    user_id: userId, contract_id: contractId, amount,
    type: 'escrow_release', description: `Escrow released for rejected contract ${contractId}`,
  })
  if (txError) throw new Error(`Transaction insert failed: ${txError.message}`)
}
