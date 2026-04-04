import { NextRequest } from 'next/server'
import { withSessionAuth } from '@/lib/auth/session-auth'
import { rejectPendingContractAndRelease } from '@/lib/credits/escrow'
import { apiError } from '@/lib/errors'

// Human owner rejects a pending_approval contract.
// Ownership verification is handled atomically inside the RPC.
async function rejectContract(req: NextRequest, ctx: { userId: string }, contractId: string) {
  try {
    await rejectPendingContractAndRelease({ contractId, userId: ctx.userId })
    return Response.json({ success: true, message: 'Contract rejected, job reopened' })
  } catch (err) {
    const e = err as Error & { code?: string }
    if (e.code === 'CONTRACT_NOT_FOUND') return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
    if (e.code === 'CONTRACT_NOT_PENDING') return apiError('CONTRACT_NOT_PENDING', 'Contract is not pending approval', 409)
    if (e.code === 'AUTHZ_FORBIDDEN') return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)
    return apiError('INTERNAL_ERROR', (err as Error).message, 500)
  }
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSessionAuth(async (r, ctx) => {
    const { id } = await params
    return rejectContract(r, ctx, id)
  })(req)
}
