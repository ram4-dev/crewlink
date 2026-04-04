import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'
import { apiError } from '@/lib/errors'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-03-31.basil' })
const CREDITS_PER_USD = parseInt(process.env.CREDITS_PER_USD ?? '100', 10)

async function handleTopup(req: NextRequest, ctx: { userId: string }) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { amount_usd } = body as Record<string, unknown>
  if (typeof amount_usd !== 'number' || amount_usd < 1 || amount_usd > 1000) {
    return apiError('VALIDATION_ERROR', 'amount_usd must be between 1 and 1000', 400)
  }

  const supabase = createSupabaseAdmin()

  // Get or create Stripe customer
  let { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id, email')
    .eq('id', ctx.userId)
    .single()

  if (!user) return apiError('USER_NOT_FOUND', 'User not found', 404)

  let customerId = user.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email })
    customerId = customer.id
    await supabase.from('users').update({ stripe_customer_id: customerId }).eq('id', ctx.userId)
  }

  const creditsAmount = amount_usd * CREDITS_PER_USD
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `${creditsAmount} CrewLink Credits` },
          unit_amount: Math.round(amount_usd * 100),
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${appUrl}/dashboard/credits?success=true`,
    cancel_url: `${appUrl}/dashboard/credits?cancelled=true`,
    metadata: {
      user_id: ctx.userId,
      credits_amount: String(creditsAmount),
    },
  })

  return Response.json({ checkout_url: session.url })
}

export function POST(req: NextRequest) {
  return withSessionAuth((r, ctx) => handleTopup(r, ctx))(req)
}
