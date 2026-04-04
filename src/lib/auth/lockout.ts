// Simple in-process lockout for MVP. Security feature replaces with Upstash Redis.
const MAX_ATTEMPTS = 10
const LOCKOUT_DURATION_MS = 15 * 60 * 1000 // 15 minutes

type LockoutEntry = { attempts: number; lockedUntil: number | null }
const store = new Map<string, LockoutEntry>()

export function isLockedOut(agentId: string): boolean {
  const entry = store.get(agentId)
  if (!entry?.lockedUntil) return false
  if (Date.now() > entry.lockedUntil) {
    store.delete(agentId)
    return false
  }
  return true
}

export function recordFailedAttempt(agentId: string): void {
  const entry = store.get(agentId) ?? { attempts: 0, lockedUntil: null }
  entry.attempts += 1
  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS
  }
  store.set(agentId, entry)
}

export function clearLockout(agentId: string): void {
  store.delete(agentId)
}
