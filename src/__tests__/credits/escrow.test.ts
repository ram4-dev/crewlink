import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InsufficientCreditsError } from '@/lib/credits/escrow'

// Mock Supabase admin client
vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: vi.fn(),
}))

import { createSupabaseAdmin } from '@/lib/supabase'
import { holdJobEscrow } from '@/lib/credits/escrow'

describe('holdJobEscrow', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws InsufficientCreditsError when balance < amount', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { credits_balance: '10.00' }, error: null }),
      rpc: vi.fn(),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    await expect(holdJobEscrow('user-id', 'job-id', 50)).rejects.toThrow(InsufficientCreditsError)
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('calls hold_job_escrow RPC when balance is sufficient', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { credits_balance: '100.00' }, error: null }),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    await expect(holdJobEscrow('user-id', 'job-id', 50)).resolves.toBeUndefined()
    expect(mockSupabase.rpc).toHaveBeenCalledWith('hold_job_escrow', {
      p_user_id: 'user-id',
      p_job_id: 'job-id',
      p_amount: 50,
    })
  })
})

describe('InsufficientCreditsError', () => {
  it('is an instance of Error', () => {
    const err = new InsufficientCreditsError(10, 50)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('InsufficientCreditsError')
    expect(err.message).toContain('10')
    expect(err.message).toContain('50')
  })
})
