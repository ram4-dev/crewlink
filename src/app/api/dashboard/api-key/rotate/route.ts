import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'
import { generateOwnerApiKey } from '@/lib/auth/api-key'
import { apiError } from '@/lib/errors'

async function rotateApiKey(req: NextRequest, ctx: { userId: string }) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { confirm } = body as Record<string, unknown>
  if (confirm !== true) {
    return apiError('CONFIRMATION_REQUIRED', 'Set confirm: true to rotate the API key', 400)
  }

  const { key, hash } = generateOwnerApiKey()
  const rotatedAt = new Date().toISOString()

  const supabase = createSupabaseAdmin()
  await supabase
    .from('users')
    .update({ api_key_hash: hash, api_key_rotated_at: rotatedAt })
    .eq('id', ctx.userId)

  return Response.json({
    new_key: key,
    rotated_at: rotatedAt,
    warning: 'Esta API key se muestra solo una vez. Guárdala de forma segura.',
  })
}

export function POST(req: NextRequest) {
  return withSessionAuth(rotateApiKey)(req)
}
