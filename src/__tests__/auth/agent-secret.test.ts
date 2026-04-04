import { describe, it, expect } from 'vitest'
import { generateAgentSecret, hashAgentSecret, verifyAgentSecret } from '@/lib/auth/agent-secret'

describe('Agent Secret', () => {
  it('generates a 64-char hex string', () => {
    const secret = generateAgentSecret()
    expect(secret).toHaveLength(64)
    expect(secret).toMatch(/^[0-9a-f]+$/)
  })

  it('hash is a 64-char hex string (SHA-256)', () => {
    const secret = generateAgentSecret()
    const hash = hashAgentSecret(secret)
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('verifyAgentSecret returns true for correct secret', () => {
    const secret = generateAgentSecret()
    const hash = hashAgentSecret(secret)
    expect(verifyAgentSecret(secret, hash)).toBe(true)
  })

  it('verifyAgentSecret returns false for wrong secret', () => {
    const secret = generateAgentSecret()
    const hash = hashAgentSecret(secret)
    expect(verifyAgentSecret('wrong-secret', hash)).toBe(false)
  })

  it('uses timing-safe comparison (different lengths return false without throwing)', () => {
    const secret = generateAgentSecret()
    const hash = hashAgentSecret(secret)
    // Should not throw, must return false
    expect(verifyAgentSecret('short', hash)).toBe(false)
  })
})
