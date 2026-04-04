import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { logAudit } from '@/lib/security/audit'

describe('logAudit', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('writes to console.error (captured by Vercel Logs)', () => {
    logAudit({ type: 'AUDIT', event: 'job_created', job_id: 'job-123' })
    expect(consoleSpy).toHaveBeenCalledOnce()
  })

  it('outputs valid JSON', () => {
    logAudit({ type: 'AUDIT', event: 'contract_completed', contract_id: 'c-123' })
    const raw = consoleSpy.mock.calls[0][0] as string
    expect(() => JSON.parse(raw)).not.toThrow()
  })

  it('includes timestamp in ISO format', () => {
    logAudit({ type: 'AUDIT', event: 'auth_failed', agent_id: 'a-123' })
    const entry = JSON.parse(consoleSpy.mock.calls[0][0] as string)
    expect(entry.timestamp).toBeDefined()
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp)
  })

  it('preserves all provided fields', () => {
    logAudit({
      type: 'SECURITY_EVENT',
      event: 'rate_limit_hit',
      agent_id: 'agent-abc',
      endpoint: '/api/agents/search',
      http_method: 'GET',
      response_code: 429,
    })
    const entry = JSON.parse(consoleSpy.mock.calls[0][0] as string)
    expect(entry.type).toBe('SECURITY_EVENT')
    expect(entry.event).toBe('rate_limit_hit')
    expect(entry.agent_id).toBe('agent-abc')
    expect(entry.endpoint).toBe('/api/agents/search')
    expect(entry.http_method).toBe('GET')
    expect(entry.response_code).toBe(429)
  })

  it('works for AUDIT type events', () => {
    const auditEvents = [
      'job_created', 'application_created', 'contract_created',
      'contract_completed', 'contract_disputed', 'contract_approved', 'contract_rejected',
      'credits_topped_up', 'escrow_held', 'escrow_released',
    ] as const

    for (const event of auditEvents) {
      consoleSpy.mockClear()
      logAudit({ type: 'AUDIT', event })
      const entry = JSON.parse(consoleSpy.mock.calls[0][0] as string)
      expect(entry.event).toBe(event)
      expect(entry.type).toBe('AUDIT')
    }
  })

  it('works for SECURITY_EVENT type events', () => {
    const securityEvents = [
      'auth_failed', 'auth_lockout', 'rate_limit_hit', 'ownership_violation',
      'depth_exceeded', 'cycle_detected', 'ssrf_blocked', 'embedding_generation_failed',
    ] as const

    for (const event of securityEvents) {
      consoleSpy.mockClear()
      logAudit({ type: 'SECURITY_EVENT', event })
      const entry = JSON.parse(consoleSpy.mock.calls[0][0] as string)
      expect(entry.event).toBe(event)
      expect(entry.type).toBe('SECURITY_EVENT')
    }
  })

  it('includes details field when provided', () => {
    logAudit({
      type: 'SECURITY_EVENT',
      event: 'depth_exceeded',
      details: { depth: 4, max: 3 },
    })
    const entry = JSON.parse(consoleSpy.mock.calls[0][0] as string)
    expect(entry.details).toEqual({ depth: 4, max: 3 })
  })

  it('omits undefined optional fields from output', () => {
    logAudit({ type: 'AUDIT', event: 'job_created' })
    const raw = consoleSpy.mock.calls[0][0] as string
    // Should not have undefined values serialized as "undefined" (JSON.stringify omits them)
    expect(raw).not.toContain('"agent_id":')
    expect(raw).not.toContain('"contract_id":')
  })
})
