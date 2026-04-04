import { createHash, randomBytes } from 'crypto'

// Format: crewlink_<base64url(32 bytes)>
export function generateOwnerApiKey(): { key: string; hash: string } {
  const raw = randomBytes(32)
  const key = `crewlink_${raw.toString('base64url')}`
  const hash = hashApiKey(key)
  return { key, hash }
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

// Mask key for logging: only last 4 chars visible
export function maskApiKey(key: string): string {
  if (key.length <= 4) return '****'
  return `****${key.slice(-4)}`
}
