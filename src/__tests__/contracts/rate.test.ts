import { describe, it, expect } from 'vitest'

// ─── Rating average calculation ───────────────────────────────────────────────
// Simulates the atomic recalculation done in the rate route:
//   new_avg = ((old_avg * old_count) + new_rating) / new_count

function recalculateRatingAvg(currentAvg: number, currentCount: number, newRating: number): number {
  const newCount = currentCount + 1
  const newAvg = (currentAvg * currentCount + newRating) / newCount
  return Math.round(newAvg * 100) / 100
}

describe('Rating average calculation', () => {
  it('first rating sets the average directly', () => {
    const avg = recalculateRatingAvg(0, 0, 5)
    expect(avg).toBe(5)
  })

  it('second rating averages correctly', () => {
    // existing avg = 4, count = 1, new rating = 2 → (4+2)/2 = 3
    const avg = recalculateRatingAvg(4, 1, 2)
    expect(avg).toBe(3)
  })

  it('many ratings converge correctly', () => {
    let avg = 0
    let count = 0
    const ratings = [5, 4, 3, 5, 4, 5, 2, 4]
    for (const r of ratings) {
      avg = recalculateRatingAvg(avg, count, r)
      count++
    }
    // sum = 32, count = 8 → 4.00
    expect(avg).toBe(4)
  })

  it('handles fractional averages and rounds to 2 decimal places', () => {
    // avg=5,count=1, new=4 → 9/2 = 4.50
    const avg = recalculateRatingAvg(5, 1, 4)
    expect(avg).toBe(4.5)
  })

  it('1-star rating brings average down', () => {
    // avg=5, count=2 → sum=10; new=1 → 11/3 = 3.67
    const avg = recalculateRatingAvg(5, 2, 1)
    expect(avg).toBe(3.67)
  })
})

// ─── Rating constraints ────────────────────────────────────────────────────────

function isValidRating(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 5
}

describe('Rating value constraints', () => {
  it('accepts 1 through 5', () => {
    [1, 2, 3, 4, 5].forEach(r => expect(isValidRating(r)).toBe(true))
  })

  it('rejects 0', () => {
    expect(isValidRating(0)).toBe(false)
  })

  it('rejects 6', () => {
    expect(isValidRating(6)).toBe(false)
  })

  it('rejects negative values', () => {
    expect(isValidRating(-1)).toBe(false)
  })

  it('rejects non-integers', () => {
    expect(isValidRating(3.5)).toBe(false)
    expect(isValidRating(4.9)).toBe(false)
  })
})

// ─── Idempotency: contract can only be rated once ─────────────────────────────

type ContractStatus = 'active' | 'completed' | 'disputed' | 'pending_approval' | 'cancelled'

function canRate(status: ContractStatus, alreadyRated: boolean): { allowed: boolean; statusCode: number } {
  if (status !== 'completed') return { allowed: false, statusCode: 409 }
  if (alreadyRated) return { allowed: false, statusCode: 409 }
  return { allowed: true, statusCode: 200 }
}

describe('Rating idempotency', () => {
  it('allows rating a completed, unrated contract', () => {
    expect(canRate('completed', false)).toMatchObject({ allowed: true, statusCode: 200 })
  })

  it('rejects rating an already-rated contract (409)', () => {
    expect(canRate('completed', true)).toMatchObject({ allowed: false, statusCode: 409 })
  })

  it('rejects rating an active contract (409)', () => {
    expect(canRate('active', false)).toMatchObject({ allowed: false, statusCode: 409 })
  })

  it('rejects rating a disputed contract (409)', () => {
    expect(canRate('disputed', false)).toMatchObject({ allowed: false, statusCode: 409 })
  })
})
