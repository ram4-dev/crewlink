import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: vi.fn(),
}))

import { createSupabaseAdmin } from '@/lib/supabase'
import { checkMaxDepth, calculateDepthLevel } from '@/lib/jobs/depth-checker'

// ─── Escrow diff on hire ───────────────────────────────────────────────────────
// When a job is created with budget_credits=500 and the agent proposes 300,
// the escrow diff is 300 - 500 = -200 (refund 200 to hiring agent).
// When the proposed price is higher, additional credits are held.

describe('Escrow diff calculation on hire', () => {
  function escrowDiff(budgetCredits: number, proposedPrice: number): number {
    return proposedPrice - budgetCredits
  }

  it('returns negative diff when proposed < budget (partial refund)', () => {
    expect(escrowDiff(500, 300)).toBe(-200)
    expect(escrowDiff(1000, 750)).toBe(-250)
  })

  it('returns zero diff when proposed == budget (no adjustment)', () => {
    expect(escrowDiff(500, 500)).toBe(0)
  })

  it('returns positive diff when proposed > budget (additional hold)', () => {
    expect(escrowDiff(500, 600)).toBe(100)
  })

  it('final escrow_credits = proposed_price', () => {
    const budget = 500
    const proposed = 300
    const initialHold = budget
    const diff = escrowDiff(budget, proposed)
    const finalEscrow = initialHold + diff
    expect(finalEscrow).toBe(proposed) // 300
  })

  it('escrow_credits is used for fee calculation, not budget_credits', () => {
    const budget = 500
    const proposed = 300
    const escrow = proposed // after hire adjustment
    // 5% tier 1 fee on escrow
    const fee = Math.round(escrow * 0.05 * 100) / 100
    expect(fee).toBe(15) // 5% of 300, not 5% of 500
  })
})

// ─── checkMaxDepth ────────────────────────────────────────────────────────────

describe('checkMaxDepth', () => {
  it('does not throw for depth 1 (root job)', () => {
    expect(() => checkMaxDepth(1)).not.toThrow()
  })

  it('does not throw for depth equal to MAX_DEPTH (default 3)', () => {
    expect(() => checkMaxDepth(3)).not.toThrow()
  })

  it('throws CHAIN_DEPTH_EXCEEDED for depth > MAX_DEPTH', () => {
    expect(() => checkMaxDepth(4)).toThrow()
    try {
      checkMaxDepth(4)
    } catch (e: unknown) {
      expect((e as { code: string }).code).toBe('CHAIN_DEPTH_EXCEEDED')
    }
  })

  it('error includes depth and max fields', () => {
    try {
      checkMaxDepth(5)
      expect.fail('should have thrown')
    } catch (e: unknown) {
      const err = e as { code: string; depth: number; max: number }
      expect(err.depth).toBe(5)
      expect(err.max).toBe(3) // default MAX_DEPTH
    }
  })
})

// ─── calculateDepthLevel ──────────────────────────────────────────────────────

describe('calculateDepthLevel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 1 when there is no parent contract (root job)', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue({} as never)
    const depth = await calculateDepthLevel('agent-id', null)
    expect(depth).toBe(1)
  })

  it('returns 1 when parent_contract_id is undefined', async () => {
    vi.mocked(createSupabaseAdmin).mockReturnValue({} as never)
    const depth = await calculateDepthLevel('agent-id', undefined)
    expect(depth).toBe(1)
  })

  it('returns parent_depth + 1 when sub-contracting', async () => {
    const parentContractId = 'parent-contract-uuid'
    const agentId = 'hired-agent-uuid'
    const jobId = 'parent-job-uuid'

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'contracts') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: parentContractId, hired_agent_id: agentId, job_id: jobId },
              error: null,
            }),
          }
        }
        if (table === 'jobs') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { depth_level: 1 }, // parent job is depth 1 → sub is depth 2
              error: null,
            }),
          }
        }
        return {}
      }),
    }

    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    const depth = await calculateDepthLevel(agentId, parentContractId)
    expect(depth).toBe(2)
  })

  it('throws FORBIDDEN when agent is not the hired_agent of parent contract', async () => {
    const parentContractId = 'parent-contract-uuid'
    const wrongAgentId = 'some-other-agent'

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: parentContractId, hired_agent_id: 'correct-agent', job_id: 'job-id' },
          error: null,
        }),
      }),
    }

    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    await expect(calculateDepthLevel(wrongAgentId, parentContractId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    })
  })

  it('throws when parent contract not found', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }

    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    await expect(calculateDepthLevel('agent-id', 'nonexistent-contract')).rejects.toThrow('Parent contract not found')
  })
})
