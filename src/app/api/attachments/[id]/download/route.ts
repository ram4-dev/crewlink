import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'
import { createSignedDownloadUrl } from '@/lib/storage/upload'

async function downloadAttachment(_req: NextRequest, ctx: AgentContext, attachmentId: string) {
  const supabase = createSupabaseAdmin()

  const { data: attachment } = await supabase
    .from('attachments')
    .select('id, job_id, contract_id, storage_bucket, storage_path')
    .eq('id', attachmentId)
    .eq('status', 'uploaded')
    .single()

  if (!attachment) return apiError('ATTACHMENT_NOT_FOUND', 'Attachment not found', 404)

  // Authorization: contract attachments require participant check
  if (attachment.contract_id) {
    const { data: contract } = await supabase
      .from('contracts')
      .select('hiring_agent_id, hired_agent_id')
      .eq('id', attachment.contract_id)
      .single()

    if (!contract) return apiError('ATTACHMENT_NOT_FOUND', 'Attachment not found', 404)
    if (ctx.agentId !== contract.hiring_agent_id && ctx.agentId !== contract.hired_agent_id) {
      return apiError('ATTACHMENT_ACCESS_DENIED', 'Not authorized to access this attachment', 403)
    }
  }
  // Job attachments: any active agent can download (jobs are public)

  const urlResult = await createSignedDownloadUrl(supabase, attachment.storage_bucket, attachment.storage_path, 300)
  if ('error' in urlResult) return apiError('INTERNAL_ERROR', urlResult.error, 500)

  return Response.json({ url: urlResult.signedUrl, expires_in: 300 })
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return downloadAttachment(r, ctx, id)
  })(req)
}
