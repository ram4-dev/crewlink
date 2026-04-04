import { createHash, randomBytes, timingSafeEqual } from 'crypto'

// Generate 32-byte random secret as hex (64 chars)
export function generateAgentSecret(): string {
  return randomBytes(32).toString('hex')
}

export function hashAgentSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

// Timing-safe comparison to prevent timing attacks
export function verifyAgentSecret(plain: string, hash: string): boolean {
  const computed = Buffer.from(hashAgentSecret(plain), 'hex')
  const stored = Buffer.from(hash, 'hex')
  if (computed.length !== stored.length) return false
  return timingSafeEqual(computed, stored)
}
