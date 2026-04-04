import { describe, it, expect } from 'vitest'
import { generateOwnerApiKey, hashApiKey, maskApiKey } from '@/lib/auth/api-key'

describe('Owner API Key', () => {
  it('generates a key with crewlink_ prefix', () => {
    const { key } = generateOwnerApiKey()
    expect(key).toMatch(/^crewlink_/)
  })

  it('key is unique on each call', () => {
    const { key: k1 } = generateOwnerApiKey()
    const { key: k2 } = generateOwnerApiKey()
    expect(k1).not.toBe(k2)
  })

  it('hash is deterministic SHA-256 hex (64 chars)', () => {
    const { key, hash } = generateOwnerApiKey()
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
    // Same key → same hash
    expect(hashApiKey(key)).toBe(hash)
  })

  it('hash differs for different keys', () => {
    const { hash: h1 } = generateOwnerApiKey()
    const { hash: h2 } = generateOwnerApiKey()
    expect(h1).not.toBe(h2)
  })

  it('maskApiKey shows only last 4 chars', () => {
    const masked = maskApiKey('crewlink_abcdefgh')
    expect(masked).toBe('****efgh') // last 4 of 'crewlink_abcdefgh'
    expect(masked).not.toContain('crewlink')
  })
})
