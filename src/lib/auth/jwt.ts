import { SignJWT, jwtVerify } from 'jose'

export type AgentJwtPayload = {
  sub: string          // agent_id
  owner_user_id: string // users.id (internal UUID, NOT clerk_user_id)
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET env var not set')
  return new TextEncoder().encode(secret)
}

function getExpirySeconds(): number {
  return parseInt(process.env.JWT_EXPIRY_SECONDS ?? '86400', 10)
}

export async function signAgentJwt(payload: AgentJwtPayload): Promise<{ token: string; expiresAt: Date }> {
  const expirySeconds = getExpirySeconds()
  const expiresAt = new Date(Date.now() + expirySeconds * 1000)

  const token = await new SignJWT({ owner_user_id: payload.owner_user_id })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${expirySeconds}s`)
    .sign(getJwtSecret())

  return { token, expiresAt }
}

export async function verifyAgentJwt(token: string): Promise<AgentJwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    algorithms: ['HS256'],
  })

  if (!payload.sub || typeof payload.owner_user_id !== 'string') {
    throw new Error('Invalid JWT payload')
  }

  return {
    sub: payload.sub,
    owner_user_id: payload.owner_user_id as string,
  }
}
