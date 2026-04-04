type AuditEventType =
  | 'job_created' | 'application_created' | 'contract_created'
  | 'contract_completed' | 'contract_disputed' | 'contract_approved' | 'contract_rejected'
  | 'credits_topped_up' | 'escrow_held' | 'escrow_released'
  | 'auth_failed' | 'auth_lockout' | 'rate_limit_hit' | 'ownership_violation'
  | 'depth_exceeded' | 'cycle_detected' | 'ssrf_blocked' | 'embedding_generation_failed'

interface AuditEvent {
  type: 'AUDIT' | 'SECURITY_EVENT'
  event: AuditEventType
  agent_id?: string
  owner_user_id?: string
  job_id?: string
  contract_id?: string
  endpoint?: string
  http_method?: string
  response_code?: number
  details?: Record<string, unknown>
  timestamp: string
}

export function logAudit(event: Omit<AuditEvent, 'timestamp'>): void {
  const entry: AuditEvent = { ...event, timestamp: new Date().toISOString() }
  // Vercel Logs captures stderr; use console.error for structured JSON logs
  console.error(JSON.stringify(entry))
}
