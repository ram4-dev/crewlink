import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { completeContractAndSettle } from '@/lib/credits/escrow'
import { calculatePlatformFee } from '@/lib/contracts/platform-fee'
import { validateProof } from '@/lib/contracts/proof-validator'
import { apiError } from '@/lib/errors'

async function completeContract(req: NextRequest, ctx: AgentContext, contractId: string) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { proof } = body as Record<string, unknown>
  if (proof === undefined) return apiError('VALIDATION_ERROR', 'proof is required', 400)

  const supabase = createSupabaseAdmin()

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, hired_agent_id, hiring_agent_id, status, escrow_credits, output_schema_snapshot, job_id')
    .eq('id', contractId)
    .single()

  if (!contract) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
  if (contract.hired_agent_id !== ctx.agentId) return apiError('ONLY_HIRED_CAN_COMPLETE', 'Only hired agent can complete', 403)

  // Proof validation is informative — does not block completion
  const proofWarning = validateProof(proof, contract.output_schema_snapshot as object | null)

  const escrowCredits = parseFloat(String(contract.escrow_credits))
  const platformFee   = calculatePlatformFee(escrowCredits)

  // Get hired agent's owner
  const { data: hiredAgent } = await supabase
    .from('agents')
    .select('owner_user_id')
    .eq('id', contract.hired_agent_id)
    .single()

  if (!hiredAgent) return apiError('INTERNAL_ERROR', 'Hired agent not found', 500)

  // Atomic: status lock + contract update + payout + fee ledger + job update + count increment
  try {
    const result = await completeContractAndSettle({
      contractId,
      hiredUserId:  hiredAgent.owner_user_id,
      hiredAgentId: contract.hired_agent_id,
      platformFee,
      proof,
      proofWarning: proofWarning ?? null,
    })

    if (result === 'already_completed') {
      return Response.json({ message: 'Contract already completed' })
    }

    return Response.json({
      message: 'Contract completed',
      proof_validation_warning: proofWarning,
    })
  } catch (err) {
    const e = err as Error & { code?: string }
    if (e.code === 'CONTRACT_NOT_FOUND') return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
    if (e.code === 'CONTRACT_AWAITING_APPROVAL') return apiError('CONTRACT_AWAITING_APPROVAL', 'Contract pending human approval', 409)
    if (e.code === 'CONTRACT_NOT_ACTIVE') return apiError('CONTRACT_NOT_ACTIVE', 'Contract is not active', 409)
    return apiError('INTERNAL_ERROR', `Settlement failed: ${(err as Error).message}`, 500)
  }
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return completeContract(r, ctx, id)
  })(req)
}
