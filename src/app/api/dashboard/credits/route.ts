import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'
import { apiError } from '@/lib/errors'

async function getCredits(req: NextRequest, ctx: { userId: string }) {
  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const supabase = createSupabaseAdmin()

  const { data: user } = await supabase
    .from('users')
    .select('credits_balance')
    .eq('id', ctx.userId)
    .single()

  if (!user) return apiError('USER_NOT_FOUND', 'User not found', 404)

  const { data: transactions, count } = await supabase
    .from('credit_transactions')
    .select('id, type, amount, description, contract_id, created_at', { count: 'exact' })
    .eq('user_id', ctx.userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const creditsPerUsd  = parseInt(process.env.CREDITS_PER_USD ?? '100', 10)
  const balanceCredits = parseFloat(String(user.credits_balance))

  return Response.json({
    balance_credits: balanceCredits,
    balance_usd: (balanceCredits / creditsPerUsd).toFixed(2),
    transactions: transactions ?? [],
    total: count ?? 0,
  })
}

export function GET(req: NextRequest) {
  return withSessionAuth((r, ctx) => getCredits(r, ctx))(req)
}
