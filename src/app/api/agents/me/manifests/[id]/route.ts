import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'
import { validateSkillManifest } from '@/lib/agents/manifest-validator'
import { validateEndpointUrl } from '@/lib/agents/ssrf-validator'
import { apiError } from '@/lib/errors'

async function updateManifest(req: NextRequest, ctx: AgentContext, manifestId: string) {
  const supabase = createSupabaseAdmin()

  const { data: existing } = await supabase
    .from('skill_manifests')
    .select('id, agent_id, endpoint_url')
    .eq('id', manifestId)
    .single()

  if (!existing) return apiError('MANIFEST_NOT_FOUND', 'Manifest not found', 404)
  if (existing.agent_id !== ctx.agentId) return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)

  let body: unknown
  try { body = await req.json() } catch {
    return apiError('INVALID_JSON', 'Request body must be valid JSON', 400)
  }

  const validation = validateSkillManifest(body as Record<string, unknown>)
  if (!validation.valid) {
    return apiError('MANIFEST_INVALID', 'Skill manifest validation failed', 400, validation.errors)
  }

  const manifest = body as Record<string, unknown>

  if (manifest.endpoint_url !== existing.endpoint_url) {
    try {
      await validateEndpointUrl(manifest.endpoint_url as string)
    } catch (err) {
      return apiError('SSRF_BLOCKED', (err as Error).message, 400)
    }
  }

  const { data, error } = await supabase
    .from('skill_manifests')
    .update({
      capability_description: manifest.capability_description,
      input_schema: manifest.input_schema,
      output_schema: manifest.output_schema,
      pricing_model: manifest.pricing_model,
      endpoint_url: manifest.endpoint_url,
      tags: manifest.tags,
    })
    .eq('id', manifestId)
    .select()
    .single()

  if (error) return apiError('INTERNAL_ERROR', 'Failed to update manifest', 500)
  return Response.json(data)
}

async function deactivateManifest(_req: NextRequest, ctx: AgentContext, manifestId: string) {
  const supabase = createSupabaseAdmin()

  const { data: existing } = await supabase
    .from('skill_manifests')
    .select('id, agent_id')
    .eq('id', manifestId)
    .single()

  if (!existing) return apiError('MANIFEST_NOT_FOUND', 'Manifest not found', 404)
  if (existing.agent_id !== ctx.agentId) return apiError('AUTHZ_FORBIDDEN', 'Forbidden', 403)

  // Check for active contracts referencing this manifest
  const { data: activeContracts } = await supabase
    .from('contracts')
    .select('id')
    .eq('selected_manifest_id', manifestId)
    .in('status', ['pending_approval', 'active'])

  if (activeContracts && activeContracts.length > 0) {
    return apiError(
      'MANIFEST_HAS_ACTIVE_CONTRACTS',
      'Cannot deactivate manifest with active contracts',
      409,
      { contract_ids: activeContracts.map((c) => c.id) }
    )
  }

  await supabase.from('skill_manifests').update({ is_active: false }).eq('id', manifestId)
  return Response.json({ success: true })
}

export function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return updateManifest(r, ctx, id)
  })(req)
}

export function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(async (r, ctx) => {
    const { id } = await params
    return deactivateManifest(r, ctx, id)
  })(req)
}
