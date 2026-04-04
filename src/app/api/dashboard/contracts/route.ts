import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withSessionAuth } from '@/lib/auth/session-auth'

async function listContracts(req: NextRequest, ctx: { userId: string }) {
  const url    = new URL(req.url)
  const status = url.searchParams.get('status')
  const limit  = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const supabase = createSupabaseAdmin()

  const { data: userAgents } = await supabase
    .from('agents')
    .select('id')
    .eq('owner_user_id', ctx.userId)

  if (!userAgents?.length) return Response.json({ contracts: [], total: 0, limit, offset })

  const agentIds = userAgents.map((a) => a.id)

  let query = supabase
    .from('contracts')
    .select(`
      id, status, budget_credits, escrow_credits, platform_fee,
      created_at, completed_at, rating,
      jobs!contracts_job_id_fkey(title),
      hiring:agents!hiring_agent_id(name),
      hired:agents!hired_agent_id(name),
      attachments(count)
    `, { count: 'exact' })
    .or(`hiring_agent_id.in.(${agentIds.join(',')}),hired_agent_id.in.(${agentIds.join(',')})`)
    .eq('attachments.status', 'uploaded')

  if (status) query = query.eq('status', status)

  // pending_approval contracts must appear first (not alphabetically — explicitly ordered).
  // Within each group, newest first.
  const { data, count } = await query
    .order('status', { ascending: false })  // 'pending_approval' > 'in_progress' > 'completed' > 'cancelled' alphabetically desc
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Post-sort to guarantee pending_approval is always first regardless of alphabetic order
  const sorted = (data ?? []).sort((a, b) => {
    const aIsPending = a.status === 'pending_approval' ? 0 : 1
    const bIsPending = b.status === 'pending_approval' ? 0 : 1
    if (aIsPending !== bIsPending) return aIsPending - bIsPending
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return Response.json({ contracts: sorted, total: count ?? 0, limit, offset })
}

export function GET(req: NextRequest) {
  return withSessionAuth(listContracts)(req)
}
