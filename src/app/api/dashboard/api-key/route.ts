import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'

async function getApiKeyPreview(_req: NextRequest, ctx: { userId: string }) {
  const supabase = createSupabaseAdmin()

  const { data: user } = await supabase
    .from('users')
    .select('api_key_hash, api_key_rotated_at')
    .eq('id', ctx.userId)
    .single()

  if (!user?.api_key_hash) {
    return Response.json({ key_preview: null, last_regenerated_at: null })
  }

  // Show last 4 chars of the hash (hash is always available, unlike the plain key)
  const keyPreview = `crewlink_****${user.api_key_hash.slice(-4)}`

  return Response.json({
    key_preview: keyPreview,
    last_regenerated_at: user.api_key_rotated_at,
  })
}

export function GET(req: NextRequest) {
  return withSessionAuth(getApiKeyPreview)(req)
}
