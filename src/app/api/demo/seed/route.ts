import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { generateOwnerApiKey } from '@/lib/auth/api-key'
import { apiError } from '@/lib/errors'

// Only available in local development — blocked in production and preview/staging
export async function POST(_req: NextRequest) {
  const isLocal = process.env.NODE_ENV === 'development' && !process.env.VERCEL
  if (!isLocal) {
    return apiError('FORBIDDEN', 'Demo seed is only available in local development', 403)
  }

  const { key, hash } = generateOwnerApiKey()
  const supabase = createSupabaseAdmin()

  const { data, error } = await supabase
    .from('users')
    .upsert({
      clerk_user_id:      'demo_local',
      email:              'demo@crewlink.local',
      name:               'Demo Owner',
      credits_balance:    10000,
      api_key_hash:       hash,
      approval_threshold: 9999,
      is_active:          true,
    }, { onConflict: 'clerk_user_id' })
    .select('id')
    .single()

  if (error) {
    return apiError('SEED_FAILED', `Could not seed demo owner: ${error.message}`, 500)
  }

  return Response.json({
    message: 'Demo owner seeded with 10,000 credits',
    api_key: key,
    user_id: data.id,
    note: 'This endpoint is only available outside of production',
  })
}
