import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'
import {
  verifyStorageFile,
  deleteStorageFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} from '@/lib/storage/upload'

async function confirmUpload(_req: NextRequest, ctx: AgentContext, attachmentId: string) {
  const supabase = createSupabaseAdmin()

  const { data: attachment } = await supabase
    .from('attachments')
    .select('*')
    .eq('id', attachmentId)
    .single()

  if (!attachment) return apiError('ATTACHMENT_NOT_FOUND', 'Attachment not found', 404)
  if (attachment.uploaded_by_agent_id !== ctx.agentId) {
    return apiError('ATTACHMENT_ACCESS_DENIED', 'Not authorized to access this attachment', 403)
  }
  if (attachment.status !== 'pending') {
    return apiError('ATTACHMENT_ALREADY_CONFIRMED', 'Attachment already confirmed', 409)
  }

  const fileCheck = await verifyStorageFile(supabase, attachment.storage_bucket, attachment.storage_path)
  if (!fileCheck.exists) {
    return apiError('FILE_NOT_UPLOADED', 'File not yet uploaded to storage', 400)
  }

  const { size, contentType } = fileCheck.metadata!

  // Validate real Content-Type against whitelist
  if (!ALLOWED_MIME_TYPES.includes(contentType)) {
    await deleteStorageFile(supabase, attachment.storage_bucket, attachment.storage_path)
    await supabase.from('attachments').delete().eq('id', attachmentId)
    return apiError('INVALID_FILE_TYPE', 'File type not allowed', 400)
  }

  // Verify actual content-type matches declared mime_type (prevent type confusion)
  if (contentType !== attachment.mime_type) {
    await deleteStorageFile(supabase, attachment.storage_bucket, attachment.storage_path)
    await supabase.from('attachments').delete().eq('id', attachmentId)
    return apiError('MIME_TYPE_MISMATCH', 'Uploaded file type does not match declared type', 400)
  }

  // Validate real file size
  if (size > MAX_FILE_SIZE) {
    await deleteStorageFile(supabase, attachment.storage_bucket, attachment.storage_path)
    await supabase.from('attachments').delete().eq('id', attachmentId)
    return apiError('FILE_TOO_LARGE', 'File exceeds 50MB limit', 400)
  }

  const { data: updated, error } = await supabase
    .from('attachments')
    .update({ status: 'uploaded', file_size_bytes: size })
    .eq('id', attachmentId)
    .select('id, original_filename, mime_type, file_size_bytes, status, created_at')
    .single()

  if (error || !updated) return apiError('INTERNAL_ERROR', 'Failed to confirm attachment', 500)

  return Response.json({ attachment: updated })
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return confirmUpload(r, ctx, id)
  })(req)
}
