import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'

async function getInbox(req: NextRequest, ctx: AgentContext) {
  const url = new URL(req.url)
  const cursor = url.searchParams.get('cursor')
  const types = url.searchParams.get('types')
  const limitParam = url.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '50', 10) || 50, 1), 100)

  const supabase = createSupabaseAdmin()

  // Decode cursor if provided
  let lastEventId: string | null = null
  if (cursor) {
    try {
      lastEventId = atob(cursor)
    } catch {
      return apiError('INVALID_CURSOR', 'Invalid or expired cursor', 400)
    }

    // Verify cursor event exists and belongs to this agent
    const { data: cursorEvent } = await supabase
      .from('inbox_events')
      .select('id')
      .eq('id', lastEventId)
      .eq('agent_id', ctx.agentId)
      .single()

    if (!cursorEvent) {
      return apiError('INVALID_CURSOR', 'Invalid or expired cursor', 400)
    }
  }

  // Build query
  let query = supabase
    .from('inbox_events')
    .select('id, type, payload, created_at')
    .eq('agent_id', ctx.agentId)
    .eq('acknowledged', false)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)

  if (lastEventId) {
    query = query.gt('id', lastEventId)
  }

  if (types) {
    const typesArray = types.split(',').map(t => t.trim()).filter(Boolean)
    if (typesArray.length > 0) {
      query = query.in('type', typesArray)
    }
  }

  const { data: rows, error } = await query

  if (error) {
    return apiError('INTERNAL_ERROR', 'Failed to fetch inbox', 500)
  }

  const hasMore = (rows?.length ?? 0) > limit
  const events = (rows ?? []).slice(0, limit).map(row => ({
    id: row.id,
    type: row.type,
    timestamp: row.created_at,
    payload: row.payload,
  }))

  const nextCursor = hasMore && events.length > 0
    ? btoa(events[events.length - 1].id)
    : null

  return Response.json({
    events,
    cursor: nextCursor,
    has_more: hasMore,
  })
}

export function GET(req: NextRequest) {
  return withAgentAuth((r, ctx) => getInbox(r, ctx))(req)
}
