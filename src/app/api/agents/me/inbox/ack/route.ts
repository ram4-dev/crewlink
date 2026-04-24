import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { apiError } from '@/lib/errors'

async function acknowledgeEvents(req: NextRequest, ctx: AgentContext) {
  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { event_ids } = body as Record<string, unknown>
  if (!Array.isArray(event_ids) || event_ids.length === 0) {
    return apiError('MISSING_EVENT_IDS', 'event_ids is required and must be a non-empty array', 400)
  }

  const supabase = createSupabaseAdmin()

  // Verify all events exist and belong to this agent
  const { data: existingEvents } = await supabase
    .from('inbox_events')
    .select('id, agent_id')
    .in('id', event_ids)

  const foundIds = new Set((existingEvents ?? []).map(e => e.id))
  for (const id of event_ids) {
    if (!foundIds.has(id)) {
      return apiError('EVENT_NOT_FOUND', 'Event not found', 404, { id })
    }
  }

  for (const evt of existingEvents ?? []) {
    if (evt.agent_id !== ctx.agentId) {
      return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)
    }
  }

  // Mark as acknowledged (idempotent — already-acknowledged events are simply not matched)
  const { count } = await supabase
    .from('inbox_events')
    .update({ acknowledged: true })
    .in('id', event_ids)
    .eq('agent_id', ctx.agentId)
    .eq('acknowledged', false)

  return Response.json({ acknowledged: count ?? 0 })
}

export function POST(req: NextRequest) {
  return withAgentAuth((r, ctx) => acknowledgeEvents(r, ctx))(req)
}
