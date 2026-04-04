import { describe, it, expect } from 'vitest'

// ─── Discovery search filter simulations ──────────────────────────────────────
// The search route at /api/agents/search performs a 3-layer search:
// 1. Tag/filter pre-filter (SQL WHERE)
// 2. Spanish FTS (tsvector match)
// 3. Semantic pgvector (feature-flagged)
//
// Since DB is not available, we simulate the filter logic here.

type Manifest = {
  agent_id: string
  tags: string[]
  pricing_type: 'per_task' | 'per_1k_tokens'
  pricing_amount: number
  is_active: boolean
  capability_description: string
  secret_key?: string
  agent?: { secret?: string; user_id?: string }
}

function filterByTags(manifests: Manifest[], requiredTags: string[]): Manifest[] {
  if (requiredTags.length === 0) return manifests
  // AND semantics: all required tags must be present
  return manifests.filter((m) => requiredTags.every((tag) => m.tags.includes(tag)))
}

function filterByMaxPrice(manifests: Manifest[], maxPrice: number | null, pricingType: string | null): Manifest[] {
  return manifests.filter((m) => {
    if (pricingType && m.pricing_type !== pricingType) return false
    if (maxPrice !== null && m.pricing_amount > maxPrice) return false
    return true
  })
}

function filterActiveManiests(manifests: Manifest[]): Manifest[] {
  return manifests.filter((m) => m.is_active)
}

function excludeSelf(manifests: Manifest[], selfAgentId: string): Manifest[] {
  return manifests.filter((m) => m.agent_id !== selfAgentId)
}

function stripSensitiveFields(manifests: Manifest[]): Omit<Manifest, 'secret_key' | 'agent'>[] {
  return manifests.map(({ secret_key: _s, agent: _a, ...safe }) => safe)
}

const sampleManifests: Manifest[] = [
  {
    agent_id: 'agent-1',
    tags: ['nlp', 'translation', 'spanish'],
    pricing_type: 'per_task',
    pricing_amount: 50,
    is_active: true,
    capability_description: 'Traduce documentos del inglés al español con alta precisión',
    secret_key: 'secret-abc',
  },
  {
    agent_id: 'agent-2',
    tags: ['nlp', 'summarization'],
    pricing_type: 'per_1k_tokens',
    pricing_amount: 0.5,
    is_active: true,
    capability_description: 'Genera resúmenes de textos largos de forma automatizada',
  },
  {
    agent_id: 'agent-3',
    tags: ['vision', 'ocr'],
    pricing_type: 'per_task',
    pricing_amount: 100,
    is_active: false,
    capability_description: 'Extrae texto de imágenes usando OCR avanzado',
  },
  {
    agent_id: 'agent-4',
    tags: ['nlp', 'translation'],
    pricing_type: 'per_task',
    pricing_amount: 200,
    is_active: true,
    capability_description: 'Especialista en traducción técnica y legal',
    agent: { secret: 'very-secret', user_id: 'owner-user-id' },
  },
]

describe('Discovery — tag filtering (AND semantics)', () => {
  it('single tag returns all matching manifests', () => {
    const results = filterByTags(sampleManifests, ['nlp'])
    expect(results).toHaveLength(3) // agents 1, 2, 4
    expect(results.map((m) => m.agent_id)).toEqual(['agent-1', 'agent-2', 'agent-4'])
  })

  it('multiple tags use AND (must have all tags)', () => {
    // nlp AND translation → agents 1 and 4
    const results = filterByTags(sampleManifests, ['nlp', 'translation'])
    expect(results).toHaveLength(2)
    expect(results.map((m) => m.agent_id)).toContain('agent-1')
    expect(results.map((m) => m.agent_id)).toContain('agent-4')
    expect(results.map((m) => m.agent_id)).not.toContain('agent-2') // has nlp but not translation
  })

  it('all three tags must match (nlp + translation + spanish)', () => {
    const results = filterByTags(sampleManifests, ['nlp', 'translation', 'spanish'])
    expect(results).toHaveLength(1)
    expect(results[0].agent_id).toBe('agent-1')
  })

  it('no tags filter returns all manifests', () => {
    const results = filterByTags(sampleManifests, [])
    expect(results).toHaveLength(sampleManifests.length)
  })

  it('tag with no match returns empty array', () => {
    const results = filterByTags(sampleManifests, ['nonexistent-tag'])
    expect(results).toHaveLength(0)
  })
})

describe('Discovery — price filtering', () => {
  it('filters by max_price for per_task manifests', () => {
    const active = filterActiveManiests(sampleManifests)
    const results = filterByMaxPrice(active, 100, 'per_task')
    // agent-1 (50) passes, agent-4 (200) fails
    expect(results.map((m) => m.agent_id)).toContain('agent-1')
    expect(results.map((m) => m.agent_id)).not.toContain('agent-4')
  })

  it('per_1k_tokens pricing is returned as-is without conversion', () => {
    // The search API passes through per_1k_tokens pricing_amount directly
    const active = filterActiveManiests(sampleManifests)
    const results = filterByMaxPrice(active, 1, 'per_1k_tokens')
    expect(results.map((m) => m.agent_id)).toContain('agent-2') // 0.5 per 1k tokens
  })

  it('max_price null means no price filter', () => {
    const active = filterActiveManiests(sampleManifests)
    const results = filterByMaxPrice(active, null, null)
    expect(results).toHaveLength(active.length)
  })
})

describe('Discovery — only active manifests returned', () => {
  it('inactive manifests are excluded', () => {
    const results = filterActiveManiests(sampleManifests)
    expect(results.map((m) => m.agent_id)).not.toContain('agent-3')
    expect(results.every((m) => m.is_active)).toBe(true)
  })
})

describe('Discovery — excludes self from results', () => {
  it('searching agent is not in its own results', () => {
    const active = filterActiveManiests(sampleManifests)
    const results = excludeSelf(active, 'agent-1')
    expect(results.map((m) => m.agent_id)).not.toContain('agent-1')
  })

  it('other agents are not excluded', () => {
    const active = filterActiveManiests(sampleManifests)
    const results = excludeSelf(active, 'agent-1')
    expect(results.map((m) => m.agent_id)).toContain('agent-2')
    expect(results.map((m) => m.agent_id)).toContain('agent-4')
  })
})

describe('Discovery — no sensitive fields in response', () => {
  it('secret_key is stripped from results', () => {
    const results = stripSensitiveFields(sampleManifests)
    results.forEach((r) => {
      expect(r).not.toHaveProperty('secret_key')
    })
  })

  it('nested agent.secret is stripped from results', () => {
    const results = stripSensitiveFields(sampleManifests)
    results.forEach((r) => {
      expect(r).not.toHaveProperty('agent')
    })
  })

  it('safe fields are preserved', () => {
    const results = stripSensitiveFields(sampleManifests)
    const first = results[0]
    expect(first).toHaveProperty('agent_id')
    expect(first).toHaveProperty('tags')
    expect(first).toHaveProperty('pricing_type')
    expect(first).toHaveProperty('capability_description')
  })
})

// ─── FTS Spanish simulation ────────────────────────────────────────────────────

function ftsMatch(query: string, description: string): boolean {
  const stems: Record<string, string> = {
    'traduce': 'traduc',
    'traducción': 'traduc',
    'traducir': 'traduc',
    'resumen': 'resum',
    'resúmenes': 'resum',
    'texto': 'text',
    'textos': 'text',
  }
  const stem = (w: string) => stems[w.toLowerCase()] ?? w.toLowerCase()
  const queryStem = stem(query)
  return description.toLowerCase().split(/\s+/).some(w => stem(w) === queryStem)
}

describe('Discovery — Spanish FTS stemming', () => {
  it('"traduccion" matches descriptions with "traduce"', () => {
    expect(ftsMatch('traducción', 'Traduce documentos del inglés al español')).toBe(true)
  })

  it('"resumen" matches descriptions with "resúmenes"', () => {
    expect(ftsMatch('resumen', 'Genera resúmenes de textos largos')).toBe(true)
  })

  it('"texto" matches descriptions with "textos"', () => {
    expect(ftsMatch('texto', 'resúmenes de textos largos')).toBe(true)
  })

  it('does not match unrelated words', () => {
    expect(ftsMatch('traducción', 'Extrae texto de imágenes')).toBe(false)
  })
})
