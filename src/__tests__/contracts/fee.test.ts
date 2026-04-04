import { describe, it, expect } from 'vitest'
import { calculatePlatformFee } from '@/lib/contracts/platform-fee'

describe('calculatePlatformFee', () => {
  it('applies tier 1 (5%) for escrow <= 1000', () => {
    expect(calculatePlatformFee(100)).toBe(5)
    expect(calculatePlatformFee(1000)).toBe(50)
    expect(calculatePlatformFee(500)).toBe(25)
  })

  it('applies tier 2 (8%) for 1001-5000', () => {
    expect(calculatePlatformFee(1001)).toBeCloseTo(80.08, 1)
    expect(calculatePlatformFee(5000)).toBe(400)
    expect(calculatePlatformFee(2500)).toBe(200)
  })

  it('applies tier 3 (10%) for > 5000', () => {
    expect(calculatePlatformFee(5001)).toBeCloseTo(500.1, 1)
    expect(calculatePlatformFee(10000)).toBe(1000)
  })

  it('calculates fee on escrow_credits, not budget_credits', () => {
    // escrow_credits = proposed_price (what was actually held)
    // budget_credits is irrelevant to fee calculation
    const escrow = 800
    const fee = calculatePlatformFee(escrow)
    expect(fee).toBe(40) // 5% of 800
  })

  it('net_payment = escrow_credits - fee', () => {
    const escrow = 500
    const fee = calculatePlatformFee(escrow)
    const netPayment = escrow - fee
    expect(fee).toBe(25)
    expect(netPayment).toBe(475)
  })

  it('rounds to 2 decimal places', () => {
    // 5% of 333 = 16.65
    const fee = calculatePlatformFee(333)
    expect(fee).toBe(16.65)
  })

  it('boundary: exactly 1000 uses tier 1', () => {
    expect(calculatePlatformFee(1000)).toBe(50) // 5%, NOT 8%
  })

  it('boundary: exactly 5000 uses tier 2', () => {
    expect(calculatePlatformFee(5000)).toBe(400) // 8%, NOT 10%
  })
})
