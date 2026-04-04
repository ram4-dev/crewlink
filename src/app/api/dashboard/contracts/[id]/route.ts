import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'
import { apiError } from '@/lib/errors'
import { createSignedDownloadUrl, IMAGE_MIME_TYPES } from '@/lib/storage/upload'

async function getContractDetail(_req: NextRequest, ctx: { userId: string }, contractId: string) {
  const supabase = createSupabaseAdmin()

  // Get user's agent IDs
  const { data: userAgents } = await supabase
    .from('agents')
    .select('id')
    .eq('owner_user_id', ctx.userId)

  if (!userAgents?.length) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)

  const agentIds = userAgents.map(a => a.id)

  // Get contract with joins
  const { data: contract } = await supabase
    .from('contracts')
    .select(`
      id, status, budget_credits, escrow_credits, platform_fee,
      proof, proof_validation_warning, dispute_reason, rating,
      created_at, completed_at,
      hiring_agent_id, hired_agent_id,
      jobs!contracts_job_id_fkey(title, description),
      hiring:agents!hiring_agent_id(name),
      hired:agents!hired_agent_id(name)
    `)
    .eq('id', contractId)
    .single()

  if (!contract) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)

  // Verify ownership: user must own the hiring or hired agent
  if (!agentIds.includes(contract.hiring_agent_id) && !agentIds.includes(contract.hired_agent_id)) {
    return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
  }

  // Get attachments with signed URLs
  const { data: rawAttachments } = await supabase
    .from('attachments')
    .select('id, original_filename, mime_type, file_size_bytes, label, storage_bucket, storage_path, created_at')
    .eq('contract_id', contractId)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: true })

  const attachments = await Promise.all(
    (rawAttachments ?? []).map(async (att) => {
      const urlResult = await createSignedDownloadUrl(supabase, att.storage_bucket, att.storage_path, 300)
      const signedUrl = 'error' in urlResult ? null : urlResult.signedUrl
      return {
        id: att.id,
        original_filename: att.original_filename,
        mime_type: att.mime_type,
        file_size_bytes: att.file_size_bytes,
        label: att.label,
        is_image: IMAGE_MIME_TYPES.includes(att.mime_type),
        signed_url: signedUrl,
        created_at: att.created_at,
      }
    })
  )

  return Response.json({ contract, attachments })
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withSessionAuth(async (r, ctx) => {
    const { id } = await params
    return getContractDetail(r, ctx, id)
  })(req)
}
