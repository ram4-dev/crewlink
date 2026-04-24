import { describe, it, expect } from 'vitest'

// ─── Cursor encoding/decoding ─────────────────────────────────────────────────

function encodeCursor(eventId: string): string {
  return btoa(eventId)
}

function decodeCursor(cursor: string): string | null {
  try {
    return atob(cursor)
  } catch {
    return null
  }
}

describe('Inbox cursor encoding', () => {
  it('encodes an event ID to base64', () => {
    const cursor = encodeCursor('evt_abc123')
    expect(cursor).toBe(btoa('evt_abc123'))
  })

  it('decodes a valid cursor back to event ID', () => {
    const cursor = encodeCursor('evt_abc123')
    expect(decodeCursor(cursor)).toBe('evt_abc123')
  })

  it('returns null for invalid base64', () => {
    expect(decodeCursor('not-valid-base64!!!')).toBeNull()
  })

  it('round-trips correctly', () => {
    const ids = ['evt_001', 'evt_xyz789', 'evt_' + 'a'.repeat(32)]
    for (const id of ids) {
      expect(decodeCursor(encodeCursor(id))).toBe(id)
    }
  })
})

// ─── Types filter parsing ─────────────────────────────────────────────────────

function parseTypesFilter(types: string | null): string[] {
  if (!types) return []
  return types.split(',').map(t => t.trim()).filter(Boolean)
}

describe('Inbox types filter parsing', () => {
  it('returns empty array for null', () => {
    expect(parseTypesFilter(null)).toEqual([])
  })

  it('returns empty array for empty string', () => {
    expect(parseTypesFilter('')).toEqual([])
  })

  it('parses single type', () => {
    expect(parseTypesFilter('application_received')).toEqual(['application_received'])
  })

  it('parses multiple comma-separated types', () => {
    expect(parseTypesFilter('application_received,contract_completed')).toEqual([
      'application_received',
      'contract_completed',
    ])
  })

  it('trims whitespace around types', () => {
    expect(parseTypesFilter(' application_received , contract_completed ')).toEqual([
      'application_received',
      'contract_completed',
    ])
  })

  it('ignores empty segments from trailing commas', () => {
    expect(parseTypesFilter('application_received,,contract_completed,')).toEqual([
      'application_received',
      'contract_completed',
    ])
  })
})

// ─── Pagination has_more logic ────────────────────────────────────────────────

function computePagination<T>(rows: T[], limit: number): { items: T[]; hasMore: boolean } {
  const hasMore = rows.length > limit
  return { items: rows.slice(0, limit), hasMore }
}

describe('Inbox pagination', () => {
  it('has_more is false when rows <= limit', () => {
    const { items, hasMore } = computePagination([1, 2, 3], 5)
    expect(items).toEqual([1, 2, 3])
    expect(hasMore).toBe(false)
  })

  it('has_more is false when rows == limit', () => {
    const { items, hasMore } = computePagination([1, 2, 3], 3)
    expect(items).toEqual([1, 2, 3])
    expect(hasMore).toBe(false)
  })

  it('has_more is true when rows > limit (we fetch limit+1)', () => {
    const { items, hasMore } = computePagination([1, 2, 3, 4], 3)
    expect(items).toEqual([1, 2, 3])
    expect(hasMore).toBe(true)
  })

  it('empty result has no more', () => {
    const { items, hasMore } = computePagination([], 50)
    expect(items).toEqual([])
    expect(hasMore).toBe(false)
  })
})

// ─── Limit clamping ──────────────────────────────────────────────────────────

function clampLimit(input: string | null, defaultLimit = 50, maxLimit = 100): number {
  const parsed = parseInt(input || String(defaultLimit), 10) || defaultLimit
  return Math.min(Math.max(parsed, 1), maxLimit)
}

describe('Inbox limit clamping', () => {
  it('defaults to 50', () => {
    expect(clampLimit(null)).toBe(50)
  })

  it('respects valid values', () => {
    expect(clampLimit('25')).toBe(25)
  })

  it('clamps to max 100', () => {
    expect(clampLimit('200')).toBe(100)
  })

  it('clamps to min 1 for negative values', () => {
    expect(clampLimit('-5')).toBe(1)
  })

  it('treats 0 as falsy and returns default', () => {
    expect(clampLimit('0')).toBe(50)
  })

  it('handles non-numeric input', () => {
    expect(clampLimit('abc')).toBe(50)
  })
})

// ─── Event ID validation ──────────────────────────────────────────────────────

function validateEventIds(eventIds: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(eventIds)) return { valid: false, error: 'event_ids must be an array' }
  if (eventIds.length === 0) return { valid: false, error: 'event_ids must not be empty' }
  for (const id of eventIds) {
    if (typeof id !== 'string' || !id.startsWith('evt_')) {
      return { valid: false, error: `Invalid event ID: ${id}` }
    }
  }
  return { valid: true }
}

describe('Event ID validation for ack', () => {
  it('rejects non-array', () => {
    expect(validateEventIds('evt_123')).toMatchObject({ valid: false })
  })

  it('rejects empty array', () => {
    expect(validateEventIds([])).toMatchObject({ valid: false })
  })

  it('accepts valid event IDs', () => {
    expect(validateEventIds(['evt_abc123', 'evt_def456'])).toMatchObject({ valid: true })
  })

  it('rejects IDs without evt_ prefix', () => {
    expect(validateEventIds(['abc123'])).toMatchObject({ valid: false })
  })

  it('rejects mixed valid/invalid', () => {
    expect(validateEventIds(['evt_ok', 123])).toMatchObject({ valid: false })
  })
})

// ─── Ownership isolation ──────────────────────────────────────────────────────

type InboxEvent = { id: string; agent_id: string; type: string }

function filterByAgent(events: InboxEvent[], agentId: string): InboxEvent[] {
  return events.filter(e => e.agent_id === agentId)
}

function canAcknowledge(event: InboxEvent, requestingAgentId: string): boolean {
  return event.agent_id === requestingAgentId
}

describe('Inbox ownership isolation', () => {
  const events: InboxEvent[] = [
    { id: 'evt_1', agent_id: 'agent-A', type: 'application_received' },
    { id: 'evt_2', agent_id: 'agent-B', type: 'contract_completed' },
    { id: 'evt_3', agent_id: 'agent-A', type: 'contract_active' },
  ]

  it('agent A only sees own events', () => {
    const filtered = filterByAgent(events, 'agent-A')
    expect(filtered).toHaveLength(2)
    expect(filtered.every(e => e.agent_id === 'agent-A')).toBe(true)
  })

  it('agent B only sees own events', () => {
    const filtered = filterByAgent(events, 'agent-B')
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('evt_2')
  })

  it('agent A can acknowledge own event', () => {
    expect(canAcknowledge(events[0], 'agent-A')).toBe(true)
  })

  it('agent A cannot acknowledge agent B event', () => {
    expect(canAcknowledge(events[1], 'agent-A')).toBe(false)
  })
})

// ─── Proof summary truncation ─────────────────────────────────────────────────

function truncateProofSummary(proof: unknown, maxLength = 200): string {
  return JSON.stringify(proof).slice(0, maxLength)
}

describe('Proof summary truncation for contract_completed', () => {
  it('short proof is not truncated', () => {
    const proof = { result: 'done' }
    const summary = truncateProofSummary(proof)
    expect(summary).toBe(JSON.stringify(proof))
  })

  it('long proof is truncated to 200 chars', () => {
    const proof = { result: 'x'.repeat(300) }
    const summary = truncateProofSummary(proof)
    expect(summary.length).toBe(200)
  })
})
