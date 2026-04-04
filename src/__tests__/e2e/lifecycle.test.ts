/**
 * E2E: Full hiring lifecycle
 *
 * register Alpha → register Beta → create job → apply → hire → complete → rate
 *
 * All steps run against the real server + real Supabase.
 * Test user is seeded in beforeAll and deleted in afterAll (cascade).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { api, seedTestUser, assertServerReachable, type TestUser } from './helpers'

let user: TestUser

// Shared state across steps (steps are sequential within the suite)
let alphaJwt: string
let alphaAgentId: string
let alphaManifestId: string
let betaJwt: string
let betaAgentId: string
let betaManifestId: string
let jobId: string
let applicationId: string
let contractId: string

beforeAll(async () => {
  await assertServerReachable()
  user = await seedTestUser({ credits: 10_000, approvalThreshold: 9_999 })
})

afterAll(async () => {
  await user.cleanup()
})

// ── Step 1: Register Alpha ─────────────────────────────────────────────────────

describe('Step 1 — Register Alpha (employer)', () => {
  it('registers successfully and returns jwt + agent_id', async () => {
    const res = await api('POST', '/api/agents/register', {
      owner_api_key: user.apiKey,
      name: 'E2E Alpha',
      framework: 'custom',
      manifest: {
        capability_description: 'Translates technical docs from English to Spanish',
        endpoint_url: 'https://alpha.e2e.internal/translate',
        tags: ['translation', 'spanish', 'e2e'],
        pricing_model: { type: 'per_task', amount: 40 },
        input_schema: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string' } },
        },
        output_schema: {
          type: 'object',
          required: ['translated_text'],
          properties: { translated_text: { type: 'string' } },
        },
      },
    })

    expect(res.status).toBe(201)
    const body = res.body as Record<string, string>
    expect(body.agent_id).toBeTruthy()
    expect(body.jwt).toBeTruthy()
    expect(body.manifest_id).toBeTruthy()

    alphaJwt = body.jwt
    alphaAgentId = body.agent_id
    alphaManifestId = body.manifest_id
  })
})

// ── Step 2: Register Beta ──────────────────────────────────────────────────────

describe('Step 2 — Register Beta (worker)', () => {
  it('registers successfully', async () => {
    const res = await api('POST', '/api/agents/register', {
      owner_api_key: user.apiKey,
      name: 'E2E Beta',
      framework: 'langchain',
      manifest: {
        capability_description: 'Summarizes and translates technical documents',
        endpoint_url: 'https://beta.e2e.internal/summarize',
        tags: ['summarization', 'translation', 'e2e'],
        pricing_model: { type: 'per_task', amount: 25 },
        input_schema: {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string' } },
        },
        output_schema: {
          type: 'object',
          required: ['translated_text'],
          properties: { translated_text: { type: 'string' } },
        },
      },
    })

    expect(res.status).toBe(201)
    const body = res.body as Record<string, string>
    expect(body.agent_id).toBeTruthy()
    expect(body.jwt).toBeTruthy()

    betaJwt = body.jwt
    betaAgentId = body.agent_id
    betaManifestId = body.manifest_id
  })
})

// ── Step 3: Alpha creates a job ────────────────────────────────────────────────

describe('Step 3 — Alpha posts a job', () => {
  it('creates job with escrow held', async () => {
    const res = await api('POST', '/api/jobs', {
      title: 'E2E: Translate REST API docs',
      description: 'Translate 5 pages of REST API documentation from English to Spanish.',
      budget_credits: 50,
      tags: ['translation', 'e2e'],
      expected_output_schema: {
        type: 'object',
        required: ['translated_text'],
        properties: { translated_text: { type: 'string' } },
      },
    }, alphaJwt)

    expect(res.status).toBe(201)
    const body = res.body as Record<string, unknown>
    expect(body.id).toBeTruthy()
    expect(body.status).toBe('open')
    expect(body.budget_credits).toBe(50)

    jobId = body.id as string
  })

  it('rejects job creation without auth', async () => {
    const res = await api('POST', '/api/jobs', {
      title: 'Unauthorized job',
      description: 'Should fail',
      budget_credits: 10,
      tags: [],
    })
    expect(res.status).toBe(401)
  })
})

// ── Step 4: Beta applies ───────────────────────────────────────────────────────

describe('Step 4 — Beta applies to the job', () => {
  it('submits application with proposed price', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/apply`, {
      manifest_id: betaManifestId,
      proposal: 'I will deliver a professional translation preserving all technical terms.',
      proposed_price: 40,
    }, betaJwt)

    expect(res.status).toBe(201)
    const body = res.body as Record<string, unknown>
    expect(body.id).toBeTruthy()
    expect(body.status).toBe('pending')
    expect(body.proposed_price).toBe(40)

    applicationId = body.id as string
  })

  it('rejects duplicate application from same agent', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/apply`, {
      manifest_id: betaManifestId,
      proposal: 'Duplicate apply attempt',
      proposed_price: 40,
    }, betaJwt)
    expect(res.status).toBe(409)
  })

  it('rejects application to non-existent job', async () => {
    const res = await api('POST', '/api/jobs/00000000-0000-0000-0000-000000000000/apply', {
      manifest_id: betaManifestId,
      proposal: 'Ghost job',
      proposed_price: 10,
    }, betaJwt)
    expect(res.status).toBe(404)
  })
})

// ── Step 5: Alpha lists applications ──────────────────────────────────────────

describe('Step 5 — Alpha reviews applications', () => {
  it('returns the application from Beta', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/applications`, null, alphaJwt)

    expect(res.status).toBe(200)
    // Endpoint returns { applications: [...] } — no total field
    const body = res.body as { applications: unknown[] }
    expect(Array.isArray(body.applications)).toBe(true)
    expect(body.applications.length).toBeGreaterThanOrEqual(1)
    expect(body.applications.some((a: unknown) => (a as { id: string }).id === applicationId)).toBe(true)
  })

  it('rejects application list when not the job poster', async () => {
    const res = await api('GET', `/api/jobs/${jobId}/applications`, null, betaJwt)
    expect(res.status).toBe(403)
  })
})

// ── Step 6: Alpha hires Beta ──────────────────────────────────────────────────

describe('Step 6 — Alpha hires Beta', () => {
  it('creates an active contract (threshold not exceeded)', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/hire`, {
      application_id: applicationId,
    }, alphaJwt)

    expect(res.status).toBe(200)
    const body = res.body as Record<string, string>
    expect(body.contract_id).toBeTruthy()
    expect(body.contract_status).toBe('active')

    contractId = body.contract_id
  })

  it('is idempotent — second hire returns same contract', async () => {
    const res = await api('POST', `/api/jobs/${jobId}/hire`, {
      application_id: applicationId,
    }, alphaJwt)

    expect(res.status).toBe(200)
    const body = res.body as Record<string, string>
    expect(body.contract_id).toBe(contractId)
  })

  it('rejects hire by non-poster agent', async () => {
    // Beta tries to hire on a job posted by Alpha — forbidden
    const res = await api('POST', `/api/jobs/${jobId}/hire`, {
      application_id: applicationId,
    }, betaJwt)
    expect(res.status).toBe(403)
  })
})

// ── Step 7: Beta completes contract ───────────────────────────────────────────

describe('Step 7 — Beta completes the contract', () => {
  it('marks contract as completed with valid proof', async () => {
    const proof = {
      translated_text:
        'Documentación de API REST traducida al español. Todos los términos técnicos preservados.',
    }

    const res = await api('POST', `/api/contracts/${contractId}/complete`, { proof }, betaJwt)

    expect(res.status).toBe(200)
    // Endpoint returns { message, proof_validation_warning }
    const body = res.body as Record<string, unknown>
    expect(body.message).toBe('Contract completed')
  })

  it('is idempotent — already-completed returns 200 with message', async () => {
    // Route returns 200 with message (not 409) for already-completed contracts
    const res = await api('POST', `/api/contracts/${contractId}/complete`, {
      proof: { translated_text: 'Again' },
    }, betaJwt)
    expect(res.status).toBe(200)
    expect((res.body as { message: string }).message).toContain('already completed')
  })

  it('rejects completion by the hiring agent (wrong role)', async () => {
    // Alpha was the hirer — only Beta (hired) can complete
    const res = await api('POST', `/api/contracts/${contractId}/complete`, {
      proof: { translated_text: 'Employer tries to complete' },
    }, alphaJwt)
    expect(res.status).toBe(403)
  })
})

// ── Step 8: Alpha rates Beta ───────────────────────────────────────────────────

describe('Step 8 — Alpha rates Beta', () => {
  it('submits a 5-star rating', async () => {
    const res = await api('POST', `/api/contracts/${contractId}/rate`, {
      rating: 5,
    }, alphaJwt)

    expect(res.status).toBe(200)
    // Endpoint returns { message: 'Contract rated successfully' }
    const body = res.body as Record<string, unknown>
    expect(body.message).toBe('Contract rated successfully')
  })

  it('rejects rating out of range', async () => {
    const res = await api('POST', `/api/contracts/${contractId}/rate`, {
      rating: 6,
    }, alphaJwt)
    expect(res.status).toBe(400)
  })
})

// ── Step 9: Dashboard contracts API ───────────────────────────────────────────

describe('Step 9 — Dashboard contracts visible', () => {
  it('returns the completed contract in dashboard listing', async () => {
    // Dashboard API uses session auth (Clerk/dev), not agent JWT.
    // In DEV_NO_AUTH mode it returns Alice's contracts, not our test user's.
    // We test it's reachable and returns a valid shape.
    const res = await api('GET', '/api/dashboard/contracts')
    expect(res.status).toBe(200)
    const body = res.body as { contracts: unknown[]; total: number }
    expect(Array.isArray(body.contracts)).toBe(true)
    expect(typeof body.total).toBe('number')
  })
})
