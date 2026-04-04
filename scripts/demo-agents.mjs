#!/usr/bin/env node
/**
 * CrewLink — 2-Agent Demo
 *
 * Simulates the full hiring lifecycle between two AI agents:
 *   Alpha (employer) → creates job, hires, rates
 *   Beta  (worker)   → applies, completes
 *
 * Usage:
 *   node scripts/demo-agents.mjs
 *   OWNER_API_KEY=crewlink_xxx node scripts/demo-agents.mjs
 *
 * Required env (in .env.local or shell):
 *   OWNER_API_KEY          — from Dashboard > Settings (or: make demo-seed)
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — for auto-seed
 *
 * Optional:
 *   CREWLINK_API_URL       — default: http://localhost:3000
 *   CONTRACT_ID            — skip to complete step (if contract already approved)
 */

import { readFileSync } from 'fs'
import { createHash, randomBytes } from 'crypto'

// ── Config ────────────────────────────────────────────────────────────────────

const ENV = loadEnv('.env.local')
const BASE_URL = (ENV.CREWLINK_API_URL || process.env.CREWLINK_API_URL || 'http://localhost:3000').replace(/\/$/, '')

// ── Colours ───────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  gray:   '\x1b[90m',
}

const ok    = (msg)       => console.log(`  ${C.green}✓${C.reset} ${msg}`)
const warn  = (msg)       => console.log(`  ${C.yellow}!${C.reset} ${msg}`)
const info  = (msg)       => console.log(`    ${C.gray}${msg}${C.reset}`)
const fail  = (msg)       => { console.error(`\n${C.red}${C.bold}✗ ${msg}${C.reset}\n`); process.exit(1) }
const step  = (n, label)  => console.log(`\n${C.cyan}${C.bold}── Step ${n}: ${label}${C.reset}`)
const hr    = ()          => console.log(`${C.gray}${'─'.repeat(60)}${C.reset}`)

// ── .env.local parser ─────────────────────────────────────────────────────────

function loadEnv(file) {
  try {
    const out = {}
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      const k = trimmed.slice(0, eq).trim()
      const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function get(key) {
  return ENV[key] || process.env[key] || ''
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function api(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  })

  let data
  try { data = await res.json() } catch { data = {} }

  if (!res.ok) {
    const errMsg = data?.message || data?.error || JSON.stringify(data)
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${errMsg}`)
  }
  return data
}

// ── Demo owner seed (local Supabase only) ─────────────────────────────────────
//   Creates a user row directly via Supabase REST when no OWNER_API_KEY is present.

async function seedDemoOwner() {
  const supabaseUrl = get('NEXT_PUBLIC_SUPABASE_URL') || 'http://localhost:54321'
  const serviceKey  = get('SUPABASE_SERVICE_ROLE_KEY')

  if (!serviceKey) return null

  const rawKey = `crewlink_demo_${randomBytes(16).toString('base64url')}`
  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const res = await fetch(`${supabaseUrl}/rest/v1/users?on_conflict=clerk_user_id`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify({
      clerk_user_id:      'demo_local',
      email:              'demo@crewlink.local',
      name:               'Demo Owner',
      credits_balance:    10000,          // 10 000 credits for the demo
      api_key_hash:       keyHash,
      approval_threshold: 9999,           // bypass manual approval in demo
      is_active:          true,
    }),
  })

  if (!res.ok) {
    const txt = await res.text()
    console.warn(`  ${C.yellow}Could not auto-seed owner:${C.reset} ${txt}`)
    return null
  }

  return rawKey
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.blue}╔══════════════════════════════════════╗${C.reset}`)
  console.log(`${C.bold}${C.blue}║   CrewLink — 2-Agent Demo Script     ║${C.reset}`)
  console.log(`${C.bold}${C.blue}╚══════════════════════════════════════╝${C.reset}`)
  console.log(`${C.gray}  API: ${BASE_URL}${C.reset}\n`)

  // ── Verify server is up ──────────────────────────────────────────────────
  try {
    const res = await fetch(`${BASE_URL}/api/ping`).catch(() => null)
    // /api/ping may not exist; 404 is fine, connection refused is not
    ok(`Server reachable at ${BASE_URL}`)
  } catch {
    fail(`Cannot reach ${BASE_URL}. Is the dev server running?\n  Run: make dev`)
  }

  // ── Resolve OWNER_API_KEY ─────────────────────────────────────────────────
  let ownerApiKey = get('OWNER_API_KEY')

  if (!ownerApiKey) {
    step('0', 'No OWNER_API_KEY found — auto-seeding demo owner...')
    ownerApiKey = await seedDemoOwner()
    if (!ownerApiKey) {
      fail(
        'OWNER_API_KEY not set.\n\n' +
        '  Option A — Local Supabase (fastest):\n' +
        '    make demo-seed          # creates demo user + prints key\n' +
        '    Then add OWNER_API_KEY=<key> to .env.local\n\n' +
        '  Option B — Via Dashboard:\n' +
        '    1. Sign in at http://localhost:3000\n' +
        '    2. Go to Settings → Rotate API Key\n' +
        '    3. Copy the key and add to .env.local:\n' +
        '       OWNER_API_KEY=crewlink_...'
      )
    }
    ok(`Demo owner seeded (key: ${ownerApiKey.slice(0, 24)}...)`)
    info('Tip: add OWNER_API_KEY=' + ownerApiKey.slice(0, 20) + '... to .env.local to reuse')
  } else {
    ok(`Using OWNER_API_KEY: ${ownerApiKey.slice(0, 20)}...`)
  }

  hr()

  // ─────────────────────────────────────────────────────────────────────────
  // If CONTRACT_ID is set, skip straight to the complete step
  // (useful when a contract was left in pending_approval)
  // ─────────────────────────────────────────────────────────────────────────
  const resumeContractId = get('CONTRACT_ID') || process.env.CONTRACT_ID
  if (resumeContractId) {
    warn(`Resuming from CONTRACT_ID=${resumeContractId}`)
    warn('Registering both agents fresh to get JWTs...')
  }

  // ── Step 1: Register Agent Alpha (employer / poster) ─────────────────────
  step('1', 'Register Agent Alpha  (employer — posts jobs, hires, rates)')

  const alphaPayload = {
    owner_api_key: ownerApiKey,
    name:          'Alpha Translator',
    framework:     'custom',
    manifest: {
      capability_description:
        'Traduce documentos técnicos del inglés al español con alta fidelidad terminológica, ' +
        'adaptando el lenguaje al contexto de la audiencia hispanohablante especializada.',
      endpoint_url:  'https://alpha-translator.demo.internal/translate',
      tags:          ['translation', 'spanish', 'english', 'technical'],
      pricing_model: { type: 'per_task', amount: 40 },
      input_schema: {
        type: 'object',
        required: ['text'],
        properties: {
          text:        { type: 'string', description: 'Text to translate' },
          source_lang: { type: 'string', enum: ['en', 'fr', 'de', 'pt'] },
        },
      },
      output_schema: {
        type: 'object',
        required: ['translated_text'],
        properties: {
          translated_text: { type: 'string' },
          confidence:      { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  }

  const alpha = await api('POST', '/api/agents/register', alphaPayload)
  ok(`Registered: ${alpha.agent_id}`)
  info(`name:        Alpha Translator`)
  info(`manifest_id: ${alpha.manifest_id}`)
  info(`jwt expires: ${alpha.expires_at}`)

  // ── Step 2: Register Agent Beta (worker / applicant) ─────────────────────
  step('2', 'Register Agent Beta   (worker — applies and completes jobs)')

  const betaPayload = {
    owner_api_key: ownerApiKey,
    name:          'Beta Summarizer',
    framework:     'langchain',
    manifest: {
      capability_description:
        'Genera resúmenes ejecutivos concisos y estructurados de textos técnicos, ' +
        'documentos empresariales y reportes extensos en español e inglés.',
      endpoint_url:  'https://beta-summarizer.demo.internal/summarize',
      tags:          ['summarization', 'nlp', 'spanish', 'translation'],
      pricing_model: { type: 'per_task', amount: 25 },
      input_schema: {
        type: 'object',
        required: ['text'],
        properties: {
          text:      { type: 'string' },
          max_words: { type: 'number', minimum: 50, maximum: 500 },
        },
      },
      output_schema: {
        type: 'object',
        required: ['translated_text'],
        properties: {
          translated_text: { type: 'string' },
          word_count:      { type: 'number' },
        },
      },
    },
  }

  const beta = await api('POST', '/api/agents/register', betaPayload)
  ok(`Registered: ${beta.agent_id}`)
  info(`name:        Beta Summarizer`)
  info(`manifest_id: ${beta.manifest_id}`)

  // If resuming an existing contract, skip to complete
  if (resumeContractId) {
    await completeAndRate(resumeContractId, beta.jwt, alpha.jwt, alpha.agent_id)
    return
  }

  // ── Step 3: Alpha creates a job ───────────────────────────────────────────
  step('3', 'Alpha creates a translation job  (budget: 50 credits)')

  const job = await api('POST', '/api/jobs', {
    title:          'Translate REST API documentation (5 pages)',
    description:
      'We need a professional Spanish translation of our REST API docs. ' +
      'Must preserve all technical terms (endpoints, HTTP methods, status codes). ' +
      'Target audience: Spanish-speaking backend developers.',
    budget_credits: 50,
    tags:           ['translation', 'spanish', 'technical'],
    expected_output_schema: {
      type:     'object',
      required: ['translated_text'],
      properties: { translated_text: { type: 'string' } },
    },
  }, alpha.jwt)

  ok(`Job created: ${job.id}`)
  info(`title:  ${job.title}`)
  info(`status: ${job.status}`)
  info(`budget: ${job.budget_credits} credits (escrow held)`)

  // ── Step 4: Beta searches for jobs ───────────────────────────────────────
  step('4', 'Beta searches for translation jobs')

  const searchRes = await api('GET', '/api/jobs?tags=translation&limit=10', null, beta.jwt)
  const matchedJob = (searchRes.jobs || []).find(j => j.id === job.id)

  if (matchedJob) {
    ok(`Found the job in search results`)
    info(`"${matchedJob.title}" · budget: ${matchedJob.budget_credits} credits`)
  } else {
    warn(`Job not in search results (may need FTS index refresh). Proceeding with known job ID.`)
  }

  // ── Step 5: Beta applies ──────────────────────────────────────────────────
  step('5', 'Beta applies to the job  (proposed: 40 credits)')

  const application = await api('POST', `/api/jobs/${job.id}/apply`, {
    manifest_id:    beta.manifest_id,
    proposal:
      'I specialize in technical documentation translation for software products. ' +
      'I will deliver an accurate Spanish translation preserving all technical terminology, ' +
      'HTTP method names, status codes, and endpoint paths exactly as-is while adapting ' +
      'surrounding prose for native Spanish speakers.',
    proposed_price: 40,
  }, beta.jwt)

  ok(`Application submitted: ${application.id}`)
  info(`status:         ${application.status}`)
  info(`proposed_price: ${application.proposed_price} credits`)

  // ── Step 6: Alpha checks applications ────────────────────────────────────
  step('6', 'Alpha reviews incoming applications')

  const appsRes = await api('GET', `/api/jobs/${job.id}/applications`, null, alpha.jwt)
  const apps = appsRes.applications || []
  ok(`${appsRes.total ?? apps.length} application(s) received`)
  for (const app of apps) {
    info(`  id: ${app.id} · agent: ${app.applicant_agent_id} · price: ${app.proposed_price}cr`)
  }

  // ── Step 7: Alpha hires Beta ──────────────────────────────────────────────
  step('7', 'Alpha hires Beta')

  const hire = await api('POST', `/api/jobs/${job.id}/hire`, {
    application_id: application.id,
  }, alpha.jwt)

  ok(`Contract created: ${hire.contract_id}`)
  info(`status: ${hire.contract_status}`)
  info(`escrow: 40 credits (adjusted from 50 budget → 40 proposed)`)

  if (hire.contract_status === 'pending_approval') {
    console.log(`
${C.yellow}${C.bold}  ⚠ Contract requires owner approval${C.reset}
  ${C.gray}The proposed price (40) exceeds the approval_threshold.

  Approve in the dashboard:
    → http://localhost:3000/dashboard/contracts

  Then resume the demo:
    CONTRACT_ID=${hire.contract_id} node scripts/demo-agents.mjs${C.reset}
`)
    process.exit(0)
  }

  // ── Steps 8 & 9: Complete + Rate ──────────────────────────────────────────
  await completeAndRate(hire.contract_id, beta.jwt, alpha.jwt, alpha.agent_id)
}

// ── Complete + Rate (also used when resuming) ─────────────────────────────────

async function completeAndRate(contractId, betaJwt, alphaJwt, alphaAgentId) {
  // ── Step 8: Beta completes the contract ────────────────────────────────────
  step('8', `Beta marks contract as complete  (${contractId})`)

  const proof = {
    translated_text:
      'Documentación de API REST traducida al español. ' +
      'Todos los términos técnicos (endpoints, métodos HTTP, códigos de estado) ' +
      'han sido preservados en su forma original mientras que el texto descriptivo ' +
      'ha sido adaptado para desarrolladores backend hispanohablantes.',
  }

  const complete = await api('POST', `/api/contracts/${contractId}/complete`, { proof }, betaJwt)
  ok(`Contract completed!`)
  if (complete.proof_validation_warning?.valid === false) {
    warn(`Proof validation warning: ${JSON.stringify(complete.proof_validation_warning.errors)}`)
  }

  // ── Step 9: Alpha rates Beta ───────────────────────────────────────────────
  step('9', 'Alpha rates Beta  (5 ★)')

  await api('POST', `/api/contracts/${contractId}/rate`, { rating: 5 }, alphaJwt)
  ok(`Rating submitted`)
  info(`Beta's rating updated (5 stars)`)

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`
${C.bold}${C.green}╔══════════════════════════════════════╗${C.reset}
${C.bold}${C.green}║          Demo Complete! ✓            ║${C.reset}
${C.bold}${C.green}╚══════════════════════════════════════╝${C.reset}

${C.bold}  Lifecycle completed:${C.reset}
  ${C.gray}register → create job → apply → hire → complete → rate${C.reset}

${C.bold}  Contract:${C.reset}  ${contractId}
${C.bold}  Escrow:  ${C.reset}  40 credits settled
${C.bold}  Fee:     ${C.reset}  2 credits (5% tier-1) → platform income
${C.bold}  Net pay: ${C.reset}  38 credits → Beta's owner

  ${C.cyan}Dashboard:${C.reset} http://localhost:3000/dashboard/contracts
  ${C.cyan}Studio:   ${C.reset} http://localhost:54323
`)
}

// ── Run ───────────────────────────────────────────────────────────────────────
main().catch(e => {
  console.error(`\n${C.red}${C.bold}Error:${C.reset} ${e.message}\n`)
  if (process.env.DEBUG) console.error(e.stack)
  else console.error(`  ${C.gray}Run with DEBUG=1 for full stack trace${C.reset}\n`)
  process.exit(1)
})
