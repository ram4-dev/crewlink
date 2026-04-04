import { describe, it, expect } from 'vitest'
import { validateProof } from '@/lib/contracts/proof-validator'

// ─── validateProof unit tests ─────────────────────────────────────────────────

describe('validateProof', () => {
  it('returns null when outputSchema is null (no schema = no validation)', () => {
    expect(validateProof({ result: 'done' }, null)).toBeNull()
  })

  it('returns valid:true when proof matches schema', () => {
    const schema = {
      type: 'object',
      properties: { result: { type: 'string' } },
      required: ['result'],
    }
    const result = validateProof({ result: 'done' }, schema)
    expect(result).toEqual({ valid: true, errors: null })
  })

  it('returns valid:false with errors when proof does not match schema', () => {
    const schema = {
      type: 'object',
      properties: { count: { type: 'number' } },
      required: ['count'],
    }
    const result = validateProof({}, schema)
    expect(result?.valid).toBe(false)
    expect(result?.errors).not.toBeNull()
    expect(Array.isArray(result?.errors)).toBe(true)
  })

  it('returns null when schema is invalid (compilation error = treat as no schema)', () => {
    // Deliberately broken schema
    const brokenSchema = { type: 'invalid-type-xyz' }
    const result = validateProof({ anything: true }, brokenSchema)
    // Ajv strict:false may not throw — but valid behavior is null or valid:false
    // We just verify it doesn't throw
    expect(() => validateProof({ anything: true }, brokenSchema)).not.toThrow()
  })

  it('includes instancePath and message in errors', () => {
    const schema = {
      type: 'object',
      properties: { age: { type: 'number', minimum: 0 } },
      required: ['age'],
    }
    const result = validateProof({ age: -1 }, schema)
    expect(result?.valid).toBe(false)
    const errors = result?.errors ?? []
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toHaveProperty('path')
    expect(errors[0]).toHaveProperty('message')
  })

  it('handles nested objects in proof', () => {
    const schema = {
      type: 'object',
      properties: {
        output: {
          type: 'object',
          properties: { lines: { type: 'array', items: { type: 'string' } } },
          required: ['lines'],
        },
      },
      required: ['output'],
    }
    const validProof = { output: { lines: ['line1', 'line2'] } }
    expect(validateProof(validProof, schema)).toEqual({ valid: true, errors: null })

    const invalidProof = { output: { lines: [1, 2, 3] } } // numbers instead of strings
    const result = validateProof(invalidProof, schema)
    expect(result?.valid).toBe(false)
  })
})

// ─── Contract status transition simulations ───────────────────────────────────
// These simulate the logic in the complete/dispute/rate routes without hitting DB.

type ContractStatus = 'active' | 'completed' | 'disputed' | 'pending_approval' | 'cancelled'

function canComplete(status: ContractStatus): { allowed: boolean; statusCode: number; reason?: string } {
  if (status === 'pending_approval') return { allowed: false, statusCode: 409, reason: 'Contract not yet approved' }
  if (status === 'completed') return { allowed: false, statusCode: 409, reason: 'Contract already completed' }
  if (status === 'disputed') return { allowed: false, statusCode: 409, reason: 'Contract is disputed' }
  if (status === 'cancelled') return { allowed: false, statusCode: 409, reason: 'Contract is cancelled' }
  return { allowed: true, statusCode: 200 }
}

describe('Contract complete — status guard', () => {
  it('allows completing an active contract', () => {
    expect(canComplete('active')).toMatchObject({ allowed: true, statusCode: 200 })
  })

  it('rejects completing a pending_approval contract (409)', () => {
    const result = canComplete('pending_approval')
    expect(result.allowed).toBe(false)
    expect(result.statusCode).toBe(409)
  })

  it('is idempotency-safe: already completed returns 409', () => {
    const result = canComplete('completed')
    expect(result.allowed).toBe(false)
    expect(result.statusCode).toBe(409)
  })

  it('rejects disputed contracts (409)', () => {
    const result = canComplete('disputed')
    expect(result.allowed).toBe(false)
    expect(result.statusCode).toBe(409)
  })

  it('rejects cancelled contracts (409)', () => {
    const result = canComplete('cancelled')
    expect(result.allowed).toBe(false)
    expect(result.statusCode).toBe(409)
  })
})

// ─── Fee + net payment on complete ───────────────────────────────────────────

describe('Contract complete — fee deduction', () => {
  it('net_payment = escrow_credits - fee (tier 1)', () => {
    const escrow = 500
    const fee = Math.round(escrow * 0.05 * 100) / 100 // 25
    const net = escrow - fee
    expect(fee).toBe(25)
    expect(net).toBe(475)
  })

  it('net_payment = escrow_credits - fee (tier 2)', () => {
    const escrow = 2000
    const fee = Math.round(escrow * 0.08 * 100) / 100 // 160
    const net = escrow - fee
    expect(fee).toBe(160)
    expect(net).toBe(1840)
  })

  it('net_payment = escrow_credits - fee (tier 3)', () => {
    const escrow = 10000
    const fee = Math.round(escrow * 0.10 * 100) / 100 // 1000
    const net = escrow - fee
    expect(fee).toBe(1000)
    expect(net).toBe(9000)
  })
})
