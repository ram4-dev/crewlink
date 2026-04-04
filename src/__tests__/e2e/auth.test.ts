/**
 * E2E: Auth error paths
 *
 * Tests that every protected endpoint correctly rejects:
 *   - Missing token
 *   - Malformed token
 *   - Expired / wrong-secret token
 *   - Invalid API key
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { api, assertServerReachable } from './helpers'
import { SignJWT } from 'jose'

const BAD_JWT = 'not.a.jwt'
const WRONG_SECRET_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.wrong'

beforeAll(async () => {
  await assertServerReachable()
})

const VALID_MANIFEST = {
  capability_description: 'Test agent for auth checks',
  endpoint_url: 'https://auth-check.e2e.internal/run',
  tags: ['e2e'],
  pricing_model: { type: 'per_task', amount: 1 },
  input_schema: { type: 'object', properties: {} },
  output_schema: { type: 'object', required: ['result'], properties: { result: { type: 'string' } } },
}

describe('Agent registration — API key auth', () => {
  it('rejects missing owner_api_key with 400 (field required)', async () => {
    // Code validates owner_api_key presence before auth check → 400 VALIDATION_ERROR
    const res = await api('POST', '/api/agents/register', {
      name: 'Ghost',
      framework: 'custom',
      manifest: VALID_MANIFEST,
    })
    expect(res.status).toBe(400)
    expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR')
  })

  it('rejects invalid owner_api_key with 401', async () => {
    const res = await api('POST', '/api/agents/register', {
      owner_api_key: 'crewlink_fake_key_that_does_not_exist',
      name: 'Ghost',
      framework: 'custom',
      manifest: VALID_MANIFEST,
    })
    expect(res.status).toBe(401)
  })
})

describe('Agent-auth endpoints — JWT validation', () => {
  const PROTECTED = [
    ['POST', '/api/jobs'],
    ['GET', '/api/agents/me'],
    // /api/agents/me/manifests only has POST (GET → 405, not 401)
    ['POST', '/api/agents/me/manifests'],
  ] as const

  for (const [method, path] of PROTECTED) {
    it(`${method} ${path} → 401 with no token`, async () => {
      const res = await api(method, path)
      expect(res.status).toBe(401)
    })

    it(`${method} ${path} → 401 with malformed token`, async () => {
      const res = await api(method, path, null, BAD_JWT)
      expect(res.status).toBe(401)
    })

    it(`${method} ${path} → 401 with wrong-secret token`, async () => {
      const res = await api(method, path, null, WRONG_SECRET_JWT)
      expect(res.status).toBe(401)
    })
  }
})

describe('Contract endpoints — JWT validation', () => {
  const fakeContractId = '00000000-0000-0000-0000-000000000000'

  it('POST /api/contracts/:id/complete → 401 with no token', async () => {
    const res = await api('POST', `/api/contracts/${fakeContractId}/complete`, {
      proof: { result: 'done' },
    })
    expect(res.status).toBe(401)
  })

  it('POST /api/contracts/:id/rate → 401 with no token', async () => {
    const res = await api('POST', `/api/contracts/${fakeContractId}/rate`, {
      rating: 5,
    })
    expect(res.status).toBe(401)
  })
})

describe('Job endpoints — JWT validation', () => {
  const fakeJobId = '00000000-0000-0000-0000-000000000000'

  it('POST /api/jobs/:id/apply → 401 with no token', async () => {
    const res = await api('POST', `/api/jobs/${fakeJobId}/apply`, {
      manifest_id: 'mid',
      proposal: 'test',
      proposed_price: 10,
    })
    expect(res.status).toBe(401)
  })

  it('POST /api/jobs/:id/hire → 401 with no token', async () => {
    const res = await api('POST', `/api/jobs/${fakeJobId}/hire`, {
      application_id: 'aid',
    })
    expect(res.status).toBe(401)
  })

  it('GET /api/jobs/:id/applications → 401 with no token', async () => {
    const res = await api('GET', `/api/jobs/${fakeJobId}/applications`)
    expect(res.status).toBe(401)
  })
})
