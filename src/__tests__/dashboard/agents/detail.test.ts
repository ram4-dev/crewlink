import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOr = vi.fn()
const mockIn = vi.fn()
const mockOrder = vi.fn()
const mockLimit = vi.fn()
const mockSingle = vi.fn()
const mockHead = vi.fn()

function chainMock() {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
  }
  return chain
}

const mockFrom = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: () => ({ from: mockFrom }),
}))

vi.mock('@/lib/auth/session-auth', () => ({
  withSessionAuth: (handler: Function) => async (req: Request) => {
    return handler(req, { userId: 'owner-1', clerkUserId: 'clerk_1' })
  },
}))

vi.mock('@/lib/errors', () => ({
  apiError: (code: string, message: string, status: number, details?: unknown) =>
    Response.json({ error: message, code, details }, { status }),
}))

describe('GET /api/dashboard/agents/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 404 when agent not found or not owned', async () => {
    const agentChain = chainMock()
    agentChain.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    mockFrom.mockReturnValue(agentChain)

    const { GET } = await import('@/app/api/dashboard/agents/[id]/route')
    const req = new Request('http://localhost/api/dashboard/agents/fake-id') as any
    const res = await GET(req, { params: Promise.resolve({ id: 'fake-id' }) })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('AGENT_NOT_FOUND')
  })

  it('returns agent with manifests and contracts when owned', async () => {
    const agent = {
      id: 'agent-1', name: 'Test Agent', framework: 'langchain',
      is_active: true, rating_avg: 4.5, ratings_count: 10,
      contracts_completed_count: 20, created_at: '2026-01-01T00:00:00Z',
    }

    let callCount = 0
    mockFrom.mockImplementation((table: string) => {
      const chain = chainMock()
      if (table === 'agents') {
        chain.single.mockResolvedValue({ data: agent, error: null })
      } else if (table === 'skill_manifests') {
        chain.order = vi.fn().mockResolvedValue({
          data: [{ id: 'm1', capability_description: 'OCR', pricing_model: { type: 'per_task', amount: 2 }, tags: ['ocr'], is_active: true, created_at: '2026-01-01' }],
          error: null,
        })
      } else if (table === 'contracts') {
        callCount++
        if (callCount <= 1) {
          // hiring contracts
          chain.limit = vi.fn().mockResolvedValue({
            data: [{ id: 'c1', budget_credits: 50, status: 'completed', rating: 5, created_at: '2026-03-20', completed_at: '2026-03-21', hired_agent: { name: 'Other Agent' }, job: { title: 'Translate docs' } }],
            error: null,
          })
        } else {
          // hired contracts
          chain.limit = vi.fn().mockResolvedValue({
            data: [],
            error: null,
          })
        }
      }
      return chain
    })

    const { GET } = await import('@/app/api/dashboard/agents/[id]/route')
    const req = new Request('http://localhost/api/dashboard/agents/agent-1') as any
    const res = await GET(req, { params: Promise.resolve({ id: 'agent-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.agent.name).toBe('Test Agent')
    expect(body.manifests).toHaveLength(1)
    expect(body.recent_contracts).toHaveLength(1)
    expect(body.recent_contracts[0].role).toBe('hiring')
    expect(body.recent_contracts[0].counterpart_name).toBe('Other Agent')
  })
})
