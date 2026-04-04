import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: vi.fn(),
}))

import { createSupabaseAdmin } from '@/lib/supabase'
import { detectCycle } from '@/lib/jobs/depth-checker'

// ─── detectCycle ──────────────────────────────────────────────────────────────
// A cycle occurs when hiredAgent is already in the hiring chain.
// Example: A hires B, B hires C, C tries to hire A → cycle detected.

function makeSupabase(jobs: Record<string, { parent_contract_id: string | null }>, contracts: Record<string, { hiring_agent_id: string; hired_agent_id: string; job_id: string }>) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((_, id: string) => ({
        single: vi.fn().mockResolvedValue({
          data: table === 'jobs' ? (jobs[id] ?? null) : (contracts[id] ?? null),
          error: null,
        }),
      })),
    })),
  }
}

describe('detectCycle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no cycle: simple root job with no parent', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { parent_contract_id: null }, error: null }),
      }),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    const hasCycle = await detectCycle('agent-A', 'agent-B', 'job-root')
    expect(hasCycle).toBe(false)
  })

  it('no cycle: A hires B, B hires C (C not in chain)', async () => {
    // Job has parent_contract_id pointing to a contract
    // Contract: hiring=A, hired=B, job_id=rootJob
    // rootJob: parent_contract_id=null → stop
    const jobId = 'job-level2'
    const parentContractId = 'contract-AB'
    const rootJobId = 'job-root'

    const mockSupabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((_col: string, id: string) => ({
          single: vi.fn().mockResolvedValue({
            data: table === 'jobs'
              ? id === jobId
                ? { parent_contract_id: parentContractId }
                : { id: rootJobId, parent_contract_id: null }
              : id === parentContractId
                ? { hiring_agent_id: 'agent-A', hired_agent_id: 'agent-B', job_id: rootJobId }
                : null,
            error: null,
          }),
        })),
      })),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    // B hires C → chain contains [B, A, B] → C is not in it
    const hasCycle = await detectCycle('agent-B', 'agent-C', jobId)
    expect(hasCycle).toBe(false)
  })

  it('detects cycle: A→B→C→A (C tries to hire A)', async () => {
    // Chain: job-level3 created by B (sub-job of contract-BC)
    //   contract-BC: hiring=B, hired=C, job_id=job-level2
    //   job-level2: parent_contract_id=contract-AB
    //   contract-AB: hiring=A, hired=B, job_id=job-root
    //   job-root: parent_contract_id=null
    const jobLevel3 = 'job-level3'
    const contractBC = 'contract-BC'
    const jobLevel2 = 'job-level2'
    const contractAB = 'contract-AB'
    const jobRoot = 'job-root'

    const jobs: Record<string, { parent_contract_id: string | null; id: string }> = {
      [jobLevel3]: { parent_contract_id: contractBC, id: jobLevel3 },
      [jobLevel2]: { parent_contract_id: contractAB, id: jobLevel2 },
      [jobRoot]: { parent_contract_id: null, id: jobRoot },
    }

    const contracts: Record<string, { hiring_agent_id: string; hired_agent_id: string; job_id: string }> = {
      [contractBC]: { hiring_agent_id: 'agent-B', hired_agent_id: 'agent-C', job_id: jobLevel2 },
      [contractAB]: { hiring_agent_id: 'agent-A', hired_agent_id: 'agent-B', job_id: jobRoot },
    }

    const mockSupabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((_col: string, id: string) => ({
          single: vi.fn().mockResolvedValue({
            data: table === 'jobs' ? (jobs[id] ?? null) : (contracts[id] ?? null),
            error: null,
          }),
        })),
      })),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    // C (hiring) tries to hire A (hired) — A is in the chain
    const hasCycle = await detectCycle('agent-C', 'agent-A', jobLevel3)
    expect(hasCycle).toBe(true)
  })

  it('detects self-hire as cycle (agent hires itself)', async () => {
    // hiringAgentId = hiredAgentId = 'agent-A'
    // The chain always starts with [hiringAgentId], so hiredAgentId is immediately found
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { parent_contract_id: null }, error: null }),
      }),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    // agent-A hires agent-A
    const hasCycle = await detectCycle('agent-A', 'agent-A', 'job-root')
    expect(hasCycle).toBe(true)
  })

  it('no cycle for unrelated agents in chain', async () => {
    // Chain only includes agent-X and agent-Y, hiring agent-Z (not in chain)
    const mockSupabase = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((_col: string, id: string) => ({
          single: vi.fn().mockResolvedValue({
            data: table === 'jobs'
              ? { parent_contract_id: 'contract-XY' }
              : { hiring_agent_id: 'agent-X', hired_agent_id: 'agent-Y', job_id: 'job-root' },
            error: null,
          }),
        })),
      })),
    }
    // For job-root (no parent), we need to return null for parent_contract_id
    // The mock always returns parent_contract_id: 'contract-XY' for jobs,
    // which would loop. Let's build a proper stateful mock.

    let jobCallCount = 0
    const mockSupabase2 = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((_col: string, _id: string) => ({
          single: vi.fn().mockResolvedValue({
            data: table === 'jobs'
              ? jobCallCount++ === 0
                ? { parent_contract_id: 'contract-XY', id: 'job-sub' }
                : { parent_contract_id: null, id: 'job-root' }
              : { hiring_agent_id: 'agent-X', hired_agent_id: 'agent-Y', job_id: 'job-root' },
            error: null,
          }),
        })),
      })),
    }

    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase2 as never)

    // agent-Y hires agent-Z → chain = [agent-Y, agent-X, agent-Y] → agent-Z not in it
    const hasCycle = await detectCycle('agent-Y', 'agent-Z', 'job-sub')
    expect(hasCycle).toBe(false)
  })
})
