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

async function requestJobUpload(req: NextRequest, ctx: AgentContext, jobId: string) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { filename, mime_type, file_size_bytes, label } = body as Record<string, unknown>

  if (!filename || typeof filename !== 'string') return apiError('VALIDATION_ERROR', 'filename is required', 400)
  if (!mime_type || typeof mime_type !== 'string') return apiError('VALIDATION_ERROR', 'mime_type is required', 400)
  if (typeof file_size_bytes !== 'number' || file_size_bytes <= 0) return apiError('VALIDATION_ERROR', 'file_size_bytes must be positive', 400)

  const supabase = createSupabaseAdmin()

  const { data: job } = await supabase
    .from('jobs')
    .select('id, poster_agent_id, status')
    .eq('id', jobId)
    .single()

  if (!job) return apiError('JOB_NOT_FOUND', 'Job not found', 404)
  if (job.poster_agent_id !== ctx.agentId) return apiError('NOT_JOB_POSTER', 'Only job poster can upload attachments', 403)
  if (job.status !== 'open') return apiError('JOB_NOT_OPEN', 'Job must be open to upload attachments', 409)

  const validation = validateFileMetadata(filename, mime_type, file_size_bytes)
  if (!validation.valid) return apiError(validation.code!, validation.error!, 400)

  const { count } = await supabase
    .from('attachments')
    .select('id', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('status', 'uploaded')

  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_PARENT) {
    return apiError('MAX_ATTACHMENTS_REACHED', 'Maximum 5 attachments reached', 409)
  }

  const storagePath = buildStoragePath(jobId, filename)
  const urlResult = await createSignedUploadUrl(supabase, 'job-attachments', storagePath)
  if ('error' in urlResult) return apiError('INTERNAL_ERROR', urlResult.error, 500)

  const { data: attachment, error } = await supabase
    .from('attachments')
    .insert({
      job_id: jobId,
      uploaded_by_agent_id: ctx.agentId,
      storage_bucket: 'job-attachments',
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

async function listJobAttachments(_req: NextRequest, _ctx: AgentContext, jobId: string) {
  const supabase = createSupabaseAdmin()

  const { data: job } = await supabase.from('jobs').select('id').eq('id', jobId).single()
  if (!job) return apiError('JOB_NOT_FOUND', 'Job not found', 404)

  const { data: attachments } = await supabase
    .from('attachments')
    .select('id, original_filename, mime_type, file_size_bytes, label, created_at')
    .eq('job_id', jobId)
    .eq('status', 'uploaded')
    .order('created_at', { ascending: true })

  return Response.json({ attachments: attachments ?? [] })
}

export function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return requestJobUpload(r, ctx, id)
  })(req)
}

export function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return listJobAttachments(r, ctx, id)
  })(req)
}
