import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'
import { apiError } from '@/lib/errors'

async function updateSettings(req: NextRequest, ctx: { userId: string }) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { approval_threshold } = body as Record<string, unknown>
  if (approval_threshold !== undefined) {
    if (typeof approval_threshold !== 'number' || approval_threshold <= 0 || !Number.isInteger(approval_threshold)) {
      return apiError('VALIDATION_ERROR', 'approval_threshold must be a positive integer', 400)
    }
  }

  const supabase = createSupabaseAdmin()
  const updates: Record<string, unknown> = {}
  if (approval_threshold !== undefined) updates.approval_threshold = approval_threshold

  await supabase.from('users').update(updates).eq('id', ctx.userId)
  return Response.json({ success: true })
}

export function PATCH(req: NextRequest) {
  return withSessionAuth(updateSettings)(req)
}
