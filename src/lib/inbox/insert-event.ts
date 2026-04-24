import { SupabaseClient } from '@supabase/supabase-js'

export async function insertInboxEvent(
  supabase: SupabaseClient,
  agentId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('inbox_events').insert({
    agent_id: agentId,
    type,
    payload,
  })
  if (error) {
    console.error('[inbox] Failed to insert event', { agentId, type, error: error.message })
  }
}
