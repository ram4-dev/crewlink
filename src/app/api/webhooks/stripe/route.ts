import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import { processStripeTopupOnce } from '@/lib/credits/escrow'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const CREDITS_PER_USD = parseInt(process.env.CREDITS_PER_USD ?? '100', 10)

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return Response.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId       = session.metadata?.user_id
    const creditsAmount = parseInt(session.metadata?.credits_amount ?? '0', 10)
    const sessionId    = session.id

    if (!userId || !creditsAmount) {
      console.error('[stripe-webhook] Missing metadata in session:', session.id)
      return Response.json({ error: 'Missing metadata' }, { status: 400 })
    }

    const description = `Recarga via Stripe — ${creditsAmount} créditos (${creditsAmount / CREDITS_PER_USD} USD)`

    try {
      // Atomic + idempotent: ledger insert and balance credit in one transaction.
      // Returns false if already processed (concurrent delivery or retry).
      const credited = await processStripeTopupOnce({
        userId,
        creditsAmount,
        stripeSessionId: sessionId,
        description,
      })

      return Response.json({ received: true, status: credited ? 'credited' : 'already_processed' })
    } catch (err) {
      console.error('[stripe-webhook] processStripeTopupOnce error:', (err as Error).message)
      return Response.json({ error: 'Internal error' }, { status: 500 })
    }
  }

  return Response.json({ received: true })
}

// Raw body required for Stripe signature verification
export const config = { api: { bodyParser: false } }
