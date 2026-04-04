import { describe, it, expect, vi, beforeEach } from 'vitest'

function chainMock() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  return chain
}

const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}))

vi.mock('@/lib/auth/agent-auth', () => ({
  withAgentAuth: (handler: Function) => async (req: Request) => {
    return handler(req, { agentId: 'caller-agent', ownerUserId: 'owner-1', sub: 'caller-agent', owner_user_id: 'owner-1' })
  },
}))

vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/errors', () => ({
  apiError: (code: string, message: string, status: number) =>
    Response.json({ error: message, code }, { status }),
}))

describe('GET /api/agents/:id (enriched public profile)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns enriched profile with active_manifests_count and recent_completed_contracts', async () => {
    const agent = {
      id: 'agent-1', name: 'OCR Agent', framework: 'langchain',
      rating_avg: 4.7, contracts_completed_count: 142, ratings_count: 130, created_at: '2026-01-01',
    }

    const manifests = [
      { id: 'm1', capability_description: 'OCR PDF', input_schema: {}, output_schema: {}, pricing_model: { type: 'per_task', amount: 2 }, endpoint_url: 'https://example.com', tags: ['ocr'], created_at: '2026-01-01' },
      { id: 'm2', capability_description: 'Translate', input_schema: {}, output_schema: {}, pricing_model: { type: 'per_task', amount: 1 }, endpoint_url: 'https://example.com', tags: ['translation'], created_at: '2026-01-02' },
    ]

    const completedContracts = [
      { status: 'completed', completed_at: '2026-03-20', job: { title: 'Translate legal doc' } },
      { status: 'completed', completed_at: '2026-03-15', job: { title: 'OCR invoice' } },
    ]

    mockFrom.mockImplementation((table: string) => {
      const chain = chainMock()
      if (table === 'agents') {
        chain.single.mockResolvedValue({ data: agent, error: null })
      } else if (table === 'skill_manifests') {
        chain.eq = vi.fn().mockReturnValue({
          ...chain,
          eq: vi.fn().mockResolvedValue({ data: manifests, error: null }),
        })
      } else if (table === 'contracts') {
        chain.limit = vi.fn().mockResolvedValue({ data: completedContracts, error: null })
      }
      return chain
    })

    const { GET } = await import('@/app/api/agents/[id]/route')
    const req = new Request('http://localhost/api/agents/agent-1', {
      headers: { authorization: 'Bearer test-token' },
    }) as any
    const res = await GET(req, { params: Promise.resolve({ id: 'agent-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agent.active_manifests_count).toBe(2)
    expect(body.recent_completed_contracts).toHaveLength(2)
    expect(body.recent_completed_contracts[0].job_title).toBe('Translate legal doc')
    // Verify no money fields exposed
    expect(body.recent_completed_contracts[0]).not.toHaveProperty('budget_credits')
    expect(body.recent_completed_contracts[0]).not.toHaveProperty('escrow_credits')
  })

  it('returns 404 for inactive agent', async () => {
    mockFrom.mockImplementation(() => {
      const chain = chainMock()
      chain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      return chain
    })

    const { GET } = await import('@/app/api/agents/[id]/route')
    const req = new Request('http://localhost/api/agents/inactive-agent', {
      headers: { authorization: 'Bearer test-token' },
    }) as any
    const res = await GET(req, { params: Promise.resolve({ id: 'inactive-agent' }) })

    expect(res.status).toBe(404)
  })
})
