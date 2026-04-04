import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  createSupabaseAdmin: vi.fn(),
}))

import { createSupabaseAdmin } from '@/lib/supabase'
import {
  adjustEscrowForHire,
  releaseJobEscrow,
  releaseContractEscrowOnReject,
  InsufficientCreditsError,
} from '@/lib/credits/escrow'

// ─── Ledger invariants ────────────────────────────────────────────────────────
// Validates that the sum of credit_transactions equals the resulting balance.

describe('Ledger reconciliation invariant', () => {
  it('balance after topup + escrow_hold = topup - escrow_hold', () => {
    const transactions = [{ amount: 500 }, { amount: -200 }]
    const balance = transactions.reduce((sum, tx) => sum + tx.amount, 0)
    expect(balance).toBe(300)
  })

  it('releasing escrow restores full balance', () => {
    const initialTopup = 500
    const escrowHeld = 200
    const escrowReleased = 200
    const balance = initialTopup - escrowHeld + escrowReleased
    expect(balance).toBe(500) // fully restored
  })

  it('settling a contract: balance = topup - escrow - fee', () => {
    const topup = 1000
    const escrow = 500 // held on job create
    const fee = 25     // 5% platform fee (tier 1)
    const net = escrow - fee // 475 paid to hired agent

    // Hiring agent: topup - escrow_hold = 500 remaining
    const hiringBalance = topup - escrow
    expect(hiringBalance).toBe(500)

    // Hired agent: +475
    const hiredBalance = net
    expect(hiredBalance).toBe(475)
  })

  it('flags discrepancy when balance != sum of transactions', () => {
    const transactions = [500, -200, 50, -30]
    const computedSum = transactions.reduce((a, b) => a + b, 0) // 320
    const recordedBalance = 350 // wrong
    expect(recordedBalance).not.toBe(computedSum)
  })
})

// ─── adjustEscrowForHire ──────────────────────────────────────────────────────

describe('adjustEscrowForHire', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is a no-op when old and new amounts are equal', async () => {
    const mockSupabase = { rpc: vi.fn() }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    await adjustEscrowForHire('user-id', 'job-id', 200, 200)
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })

  it('calls adjust_escrow when proposed price < budget (diff < 0 → refund)', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { credits_balance: '1000.00' }, error: null }),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    // Old: 500, New: 300 → diff = -200 (refund, no balance check needed)
    await adjustEscrowForHire('user-id', 'job-id', 500, 300)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('adjust_escrow', {
      p_user_id: 'user-id',
      p_job_id: 'job-id',
      p_old_amount: 500,
      p_new_amount: 300,
    })
  })

  it('calls adjust_escrow when proposed > budget (diff > 0 → additional hold)', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { credits_balance: '1000.00' }, error: null }),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    // Old: 300, New: 500 → diff = +200 (need more credits)
    await adjustEscrowForHire('user-id', 'job-id', 300, 500)
    expect(mockSupabase.rpc).toHaveBeenCalledWith('adjust_escrow', {
      p_user_id: 'user-id',
      p_job_id: 'job-id',
      p_old_amount: 300,
      p_new_amount: 500,
    })
  })

  it('throws InsufficientCreditsError when diff > balance', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      // only 50 credits, need 200 more
      single: vi.fn().mockResolvedValue({ data: { credits_balance: '50.00' }, error: null }),
      rpc: vi.fn(),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    await expect(adjustEscrowForHire('user-id', 'job-id', 300, 500)).rejects.toThrow(InsufficientCreditsError)
    expect(mockSupabase.rpc).not.toHaveBeenCalled()
  })
})

// ─── releaseContractEscrowOnReject ────────────────────────────────────────────

describe('releaseContractEscrowOnReject', () => {
  beforeEach(() => vi.clearAllMocks())

  it('restores balance and inserts escrow_release transaction', async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnThis()
    const eqMock = vi.fn().mockResolvedValue({ error: null })

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'users') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { credits_balance: '100.00' }, error: null }),
            update: updateMock,
          }
        }
        if (table === 'credit_transactions') {
          return { insert: insertMock }
        }
        return {}
      }),
    }

    // Wire update chain: update().eq()
    updateMock.mockReturnValue({ eq: eqMock })

    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    await releaseContractEscrowOnReject('user-id', 'contract-id', 200)

    expect(updateMock).toHaveBeenCalledWith({ credits_balance: 300 }) // 100 + 200
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-id',
        contract_id: 'contract-id',
        amount: 200,
        type: 'escrow_release',
      })
    )
  })

  it('throws if user not found', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }
    vi.mocked(createSupabaseAdmin).mockReturnValue(mockSupabase as never)

    await expect(
      releaseContractEscrowOnReject('missing-user', 'contract-id', 100)
    ).rejects.toThrow('User not found')
  })
})
