import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { hashApiKey } from '@/lib/auth/api-key'
import { generateAgentSecret, hashAgentSecret } from '@/lib/auth/agent-secret'
import { signAgentJwt } from '@/lib/auth/jwt'
import { apiError } from '@/lib/errors'
import { validateSkillManifest } from '@/lib/agents/manifest-validator'
import { validateEndpointUrl } from '@/lib/agents/ssrf-validator'

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const { owner_api_key, name, framework, manifest } = body as Record<string, unknown>

  if (!owner_api_key || typeof owner_api_key !== 'string') {
    return apiError('VALIDATION_ERROR', 'owner_api_key is required', 400)
  }
  if (!name || typeof name !== 'string') {
    return apiError('VALIDATION_ERROR', 'name is required', 400)
  }
  if (!manifest || typeof manifest !== 'object') {
    return apiError('VALIDATION_ERROR', 'manifest is required', 400)
  }

  // 1. Structural + schema validation
  const manifestValidation = validateSkillManifest(manifest as Record<string, unknown>)
  if (!manifestValidation.valid) {
    return apiError('MANIFEST_INVALID', 'Skill manifest validation failed', 400, manifestValidation.errors)
  }

  const m = manifest as Record<string, unknown>

  // 2. SSRF validation of endpoint_url — must pass before any DB write
  if (typeof m.endpoint_url === 'string') {
    try {
      await validateEndpointUrl(m.endpoint_url)
    } catch (err) {
      return apiError('SSRF_BLOCKED', (err as Error).message, 400)
    }
  }

  const supabase = createSupabaseAdmin()

  // 3. Validate Owner API key
  const keyHash = hashApiKey(owner_api_key)
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('api_key_hash', keyHash)
    .eq('is_active', true)
    .single()

  if (userError || !user) {
    return apiError('AUTH_INVALID_API_KEY', 'Invalid owner API key', 401)
  }

  // 4. Generate agent credentials
  const agentSecret     = generateAgentSecret()
  const agentSecretHash = hashAgentSecret(agentSecret)

  // 5. Insert agent
  const { data: agent, error: agentError } = await supabase
    .from('agents')
    .insert({
      owner_user_id:     user.id,
      agent_secret_hash: agentSecretHash,
      name:              name as string,
      framework:         typeof framework === 'string' ? framework : null,
    })
    .select('id')
    .single()

  if (agentError || !agent) {
    console.error('[register] agent insert error:', agentError?.message)
    return apiError('INTERNAL_ERROR', 'Failed to create agent', 500)
  }

  // 6. Insert skill manifest (SSRF already validated above)
  const { data: manifestRow, error: manifestError } = await supabase
    .from('skill_manifests')
    .insert({
      agent_id:               agent.id,
      capability_description: m.capability_description,
      input_schema:           m.input_schema,
      output_schema:          m.output_schema,
      pricing_model:          m.pricing_model,
      endpoint_url:           m.endpoint_url,
      tags:                   Array.isArray(m.tags) ? m.tags : [],
    })
    .select('id')
    .single()

  if (manifestError || !manifestRow) {
    // Rollback agent on manifest failure
    await supabase.from('agents').delete().eq('id', agent.id)
    return apiError('INTERNAL_ERROR', 'Failed to create skill manifest', 500)
  }

  // 7. Sign JWT
  const { token, expiresAt } = await signAgentJwt({
    sub:           agent.id,
    owner_user_id: user.id,
  })

  return Response.json(
    {
      agent_id:    agent.id,
      agent_secret: agentSecret,
      jwt:          token,
      manifest_id:  manifestRow.id,
      expires_at:   expiresAt.toISOString(),
      warning: 'El agent_secret se muestra solo una vez. Guárdalo de forma segura.',
    },
    { status: 201 }
  )
}
