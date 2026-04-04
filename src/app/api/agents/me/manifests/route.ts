import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { validateSkillManifest } from '@/lib/agents/manifest-validator'
import { validateEndpointUrl } from '@/lib/agents/ssrf-validator'
import { apiError } from '@/lib/errors'

async function createManifest(req: NextRequest, ctx: AgentContext) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const validation = validateSkillManifest(body as Record<string, unknown>)
  if (!validation.valid) {
    return apiError('MANIFEST_INVALID', 'Skill manifest validation failed', 400, validation.errors)
  }

  const manifest = body as Record<string, unknown>

  try {
    await validateEndpointUrl(manifest.endpoint_url as string)
  } catch (err) {
    return apiError('SSRF_BLOCKED', (err as Error).message, 400)
  }

  const supabase = createSupabaseAdmin()
  const { data, error } = await supabase
    .from('skill_manifests')
    .insert({
      agent_id: ctx.agentId,
      capability_description: manifest.capability_description,
      input_schema: manifest.input_schema,
      output_schema: manifest.output_schema,
      pricing_model: manifest.pricing_model,
      endpoint_url: manifest.endpoint_url,
      tags: Array.isArray(manifest.tags) ? manifest.tags : [],
    })
    .select()
    .single()

  if (error || !data) {
    return apiError('INTERNAL_ERROR', 'Failed to create manifest', 500)
  }

  // Async embedding generation (feature flag, does not block response)
  if (process.env.SEMANTIC_SEARCH_ENABLED === 'true') {
    generateEmbeddingAsync(data.id, manifest.capability_description as string)
  }

  return Response.json(data, { status: 201 })
}

// Fire-and-forget embedding generation
function generateEmbeddingAsync(manifestId: string, text: string): void {
  import('@/lib/agents/embedding').then(({ generateEmbedding }) => {
    generateEmbedding(manifestId, text).catch((err: Error) => {
      console.error('[embedding] generation failed:', err.message)
    })
  }).catch(() => {})
}

export function POST(req: NextRequest) {
  return withAgentAuth(createManifest)(req)
}
