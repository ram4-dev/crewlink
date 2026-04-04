import { describe, it, expect } from 'vitest'
import { signAgentJwt, verifyAgentJwt } from '@/lib/auth/jwt'

const AGENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111'

describe('JWT', () => {
  it('signs and verifies a JWT with correct payload', async () => {
    const { token, expiresAt } = await signAgentJwt({ sub: AGENT_ID, owner_user_id: OWNER_USER_ID })
    expect(token).toBeTruthy()
    expect(expiresAt).toBeInstanceOf(Date)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())

    const payload = await verifyAgentJwt(token)
    expect(payload.sub).toBe(AGENT_ID)
    expect(payload.owner_user_id).toBe(OWNER_USER_ID)
  })

  it('payload contains owner_user_id (internal UUID, not clerk_user_id)', async () => {
    const { token } = await signAgentJwt({ sub: AGENT_ID, owner_user_id: OWNER_USER_ID })
    const payload = await verifyAgentJwt(token)
    // owner_user_id must be the internal users.id UUID
    expect(payload.owner_user_id).toBe(OWNER_USER_ID)
    // Ensure no clerk_ prefix leaked into JWT
    expect(payload.owner_user_id).not.toMatch(/^user_/)
  })

  it('rejects tampered tokens', async () => {
    const { token } = await signAgentJwt({ sub: AGENT_ID, owner_user_id: OWNER_USER_ID })
    const tampered = token.slice(0, -5) + 'XXXXX'
    await expect(verifyAgentJwt(tampered)).rejects.toThrow()
  })
})
