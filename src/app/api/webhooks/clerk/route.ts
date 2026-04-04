import { NextRequest } from 'next/server'
import { Webhook } from 'svix'
import { createSupabaseAdmin } from '@/lib/supabase'
import { generateOwnerApiKey } from '@/lib/auth/api-key'
// generateOwnerApiKey is used to pre-generate the hash; the plaintext key is NOT stored here.
// Users retrieve their first key via POST /api/dashboard/api-key/rotate (one-time, authenticated).

type ClerkUserEvent = {
  type: 'user.created' | 'user.updated' | 'user.deleted'
  data: {
    id: string
    email_addresses: Array<{ email_address: string; id: string }>
    primary_email_address_id: string
    first_name: string | null
    last_name: string | null
    deleted?: boolean
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET
  if (!webhookSecret) {
    return Response.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const svixId = req.headers.get('svix-id')
  const svixTimestamp = req.headers.get('svix-timestamp')
  const svixSignature = req.headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const body = await req.text()

  let event: ClerkUserEvent
  try {
    const wh = new Webhook(webhookSecret)
    event = wh.verify(body, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkUserEvent
  } catch {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  const supabase = createSupabaseAdmin()

  if (event.type === 'user.created') {
    const { data } = event
    const primaryEmail = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id
    )?.email_address ?? data.email_addresses[0]?.email_address

    if (!primaryEmail) {
      return Response.json({ error: 'No email found' }, { status: 400 })
    }

    const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || 'Unknown'
    const { hash: apiKeyHash } = generateOwnerApiKey()
    // Plaintext key is intentionally discarded; user generates their first visible key
    // via POST /api/dashboard/api-key/rotate after login.

    const { error } = await supabase.from('users').insert({
      clerk_user_id: data.id,
      email: primaryEmail,
      name,
      api_key_hash: apiKeyHash,
    })

    if (error) {
      console.error('[clerk-webhook] user.created insert error:', error.message)
      return Response.json({ error: 'Failed to create user' }, { status: 500 })
    }

    // API key is NOT broadcast over Realtime — that would expose it to any listener
    // on the shared channel. The owner retrieves it once via the authenticated
    // dashboard endpoint GET /api/dashboard/api-key (one-time retrieval on first login).

    return Response.json({ success: true }, { status: 201 })
  }

  if (event.type === 'user.updated') {
    const { data } = event
    const primaryEmail = data.email_addresses.find(
      (e) => e.id === data.primary_email_address_id
    )?.email_address
    const name = [data.first_name, data.last_name].filter(Boolean).join(' ') || undefined

    await supabase
      .from('users')
      .update({ ...(primaryEmail ? { email: primaryEmail } : {}), ...(name ? { name } : {}) })
      .eq('clerk_user_id', data.id)

    return Response.json({ success: true })
  }

  if (event.type === 'user.deleted') {
    // Soft delete: preserve FK integrity
    await supabase
      .from('users')
      .update({ is_active: false })
      .eq('clerk_user_id', event.data.id)

    return Response.json({ success: true })
  }

  return Response.json({ success: true })
}
