import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'
import {
  validateFileMetadata,
  buildStoragePath,
  createSignedUploadUrl,
  MAX_ATTACHMENTS_PER_PARENT,
} from '@/lib/storage/upload'

async function requestContractUpload(req: NextRequest, ctx: AgentContext, contractId: string) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { filename, mime_type, file_size_bytes, label } = body as Record<string, unknown>

  if (!filename || typeof filename !== 'string') return apiError('VALIDATION_ERROR', 'filename is required', 400)
  if (!mime_type || typeof mime_type !== 'string') return apiError('VALIDATION_ERROR', 'mime_type is required', 400)
  if (typeof file_size_bytes !== 'number' || file_size_bytes <= 0) return apiError('VALIDATION_ERROR', 'file_size_bytes must be positive', 400)

  const supabase = createSupabaseAdmin()

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, hired_agent_id, hiring_agent_id, status')
    .eq('id', contractId)
    .single()

  if (!contract) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
  if (contract.hired_agent_id !== ctx.agentId) return apiError('NOT_HIRED_AGENT', 'Only hired agent can upload deliverables', 403)
  if (contract.status !== 'active') return apiError('CONTRACT_NOT_ACTIVE', 'Contract must be active to upload deliverables', 409)

  const validation = validateFileMetadata(filename, mime_type, file_size_bytes)
  if (!validation.valid) return apiError(validation.code!, validation.error!, 400)

  const { count } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .eq('contract_id', contractId)
    .eq('status', 'uploaded')

  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_PARENT) {
    return apiError('MAX_ATTACHMENTS_REACHED', 'Maximum 5 attachments reached', 409)
  }

  const storagePath = buildStoragePath(contractId, filename)
  const urlResult = await createSignedUploadUrl(supabase, 'contract-deliverables', storagePath)
  if ('error' in urlResult) return apiError('INTERNAL_ERROR', urlResult.error, 500)

  const { data: attachment, error } = await supabase
    .from('attachments')
    .insert({
      contract_id: contractId,
      uploaded_by_agent_id: ctx.agentId,
      storage_bucket: 'contract-deliverables',
      storage_path: storagePath,
      original_filename: filename,
      mime_type,
      file_size_bytes,
      status: 'pending',
      label: typeof label === 'string' ? label : null,
    })
    .select('id, original_filename, mime_type, file_size_bytes, label, status, created_at')
    .single()

  if (error || !attachment) return apiError('INTERNAL_ERROR', 'Failed to create attachment', 500)

  return Response.json({
    attachment,
    upload_url: urlResult.signedUrl,
    upload_token: urlResult.token,
    expires_in: 300,
  }, { status: 201 })
}

async function listContractAttachments(_req: NextRequest, ctx: AgentContext, contractId: string) {
  const supabase = createSupabaseAdmin()

  const { data: contract } = await supabase
    .from('contracts')
    .select('id, hiring_agent_id, hired_agent_id')
    .eq('id', contractId)
    .single()

  if (!contract) return apiError('CONTRACT_NOT_FOUND', 'Contract not found', 404)
  if (ctx.agentId !== contract.hiring_agent_id && ctx.agentId !== contract.hired_agent_id) {
    return apiError('ATTACHMENT_ACCESS_DENIED', 'Not authorized to access this attachment', 403)
  }

  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, original_filename, mime_type, file_size_bytes, label, created_at')
    .eq('contract_id', contractId)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: true })

  return Response.json({ attachments: attachments ?? [] })
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return requestContractUpload(r, ctx, id)
  })(req)
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return listContractAttachments(r, ctx, id)
  })(req)
}
