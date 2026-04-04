/**
 * E2E test helpers.
 *
 * Design: each test file seeds its own user with a unique clerk_user_id
 * so tests are fully isolated and can run in any order.
 * afterAll() cleans up via cascade delete.
 */

import { createHash, randomBytes } from 'crypto'

// ── Config ─────────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  try {
    const fs = require('fs') as typeof import('fs')
    const out: Record<string, string> = {}
    for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 0) continue
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    }
    return out
  } catch {
    return {}
  }
}

const ENV = loadEnv()

function env(key: string): string {
  return ENV[key] || process.env[key] || ''
}

export const BASE_URL = (env('CREWLINK_API_URL') || 'http://localhost:3000').replace(/\/$/, '')
const SUPABASE_URL = env('NEXT_PUBLIC_SUPABASE_URL') || 'http://localhost:54321'
const SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')

// ── HTTP helper ────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  status: number
  ok: boolean
  body: T
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body: unknown = null,
  token: string | null = null,
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  })

  let data: T
  try { data = await res.json() as T } catch { data = {} as T }

  return { status: res.status, ok: res.ok, body: data }
}

// ── Supabase admin helpers ─────────────────────────────────────────────────────

async function supabaseAdmin(
  method: string,
  table: string,
  body?: unknown,
  params = '',
): Promise<{ ok: boolean; data: unknown }> {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set — run: make env-local')

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    body: body !== null ? JSON.stringify(body) : undefined,
  })

  const data = res.status === 204 ? null : await res.json().catch(() => null)
  return { ok: res.ok, data }
}

// ── Test user lifecycle ────────────────────────────────────────────────────────

export interface TestUser {
  userId: string
  clerkId: string
  apiKey: string
  cleanup: () => Promise<void>
}

export async function seedTestUser(opts?: {
  credits?: number
  approvalThreshold?: number
  name?: string
}): Promise<TestUser> {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set')

  const clerkId = `e2e_${randomBytes(8).toString('hex')}`
  const rawKey = `crewlink_e2e_${randomBytes(16).toString('base64url')}`
  const keyHash = createHash('sha256').update(rawKey).digest('hex')

  const { ok, data } = await supabaseAdmin(
    'POST',
    'users?on_conflict=clerk_user_id',
    {
      clerk_user_id: clerkId,
      email: `${clerkId}@e2e.test`,
      name: opts?.name ?? 'E2E Test User',
      credits_balance: opts?.credits ?? 10_000,
      api_key_hash: keyHash,
      approval_threshold: opts?.approvalThreshold ?? 9_999,
      is_active: true,
    },
  )

  if (!ok) throw new Error(`Failed to seed test user: ${JSON.stringify(data)}`)

  const row = (Array.isArray(data) ? data[0] : data) as { id: string }
  const userId = row.id

  async function cleanup() {
    // Cascade via FK: agents → jobs/applications/contracts all cascade from users
    await supabaseAdmin('DELETE', `users?id=eq.${userId}`)
  }

  return { userId, clerkId, apiKey: rawKey, cleanup }
}

// ── Verify server is reachable ─────────────────────────────────────────────────

export async function assertServerReachable(): Promise<void> {
  try {
    await fetch(`${BASE_URL}/api/agents/search?q=test`)
  } catch {
    throw new Error(
      `Cannot reach ${BASE_URL}. Start the dev server first:\n  make dev`,
    )
  }
}
