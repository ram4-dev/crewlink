import { NextRequest } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase'
import { withAgentAuth, AgentContext } from '@/lib/auth/agent-auth'

// Canonical flag name: FEATURE_FLAG_SEMANTIC_SEARCH (SEMANTIC_SEARCH_ENABLED is deprecated)
if (process.env.SEMANTIC_SEARCH_ENABLED && !process.env.FEATURE_FLAG_SEMANTIC_SEARCH) {
  console.warn('[search] SEMANTIC_SEARCH_ENABLED is deprecated — use FEATURE_FLAG_SEMANTIC_SEARCH')
}

async function searchAgents(req: NextRequest, ctx: AgentContext) {
  const url         = new URL(req.url)
  const q           = url.searchParams.get('q') ?? null
  const tagsParam   = url.searchParams.get('tags')
  const tags        = tagsParam ? tagsParam.split(',').map((t) => t.trim()).filter(Boolean) : null
  const minRating   = url.searchParams.get('min_rating') ? parseFloat(url.searchParams.get('min_rating')!) : null
  const maxPrice    = url.searchParams.get('max_price') ? parseFloat(url.searchParams.get('max_price')!) : null
  const pricingType = url.searchParams.get('pricing_type') ?? null
  const limit       = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 50)
  const offset      = parseInt(url.searchParams.get('offset') ?? '0', 10)
  const semanticFlag =
    process.env.FEATURE_FLAG_SEMANTIC_SEARCH === 'true' ||
    process.env.SEMANTIC_SEARCH_ENABLED === 'true'
  const semantic = url.searchParams.get('semantic') === 'true' && semanticFlag

  const supabase = createSupabaseAdmin()

  // Phase A: fetch ALL matching manifests (no limit) to compute a stable total.
  // Deduplication by agent happens before pagination so `total` = real distinct agent count.
  let query = supabase
    .from('skill_manifests')
    .select(`
      id, capability_description, input_schema, output_schema,
      pricing_model, endpoint_url, tags,
      agents!inner(
        id, name, framework, rating_avg,
        contracts_completed_count, ratings_count
      )
    `)
    .eq('is_active', true)
    .eq('agents.is_active', true)
    .neq('agents.id', ctx.agentId)

  if (tags && tags.length > 0) {
    query = query.contains('tags', tags)
  }
  if (minRating !== null) {
    query = query.gte('agents.rating_avg', minRating)
  }
  if (pricingType) {
    query = (query as ReturnType<typeof query.eq>).filter('pricing_model->>type', 'eq', pricingType)
  }
  if (maxPrice !== null) {
    query = (query as ReturnType<typeof query.eq>).or(
      `pricing_model->>type.neq.per_task,pricing_model->>amount.lte.${maxPrice}`
    )
  }

  if (q) {
    // Match q against agent names (may not appear in capability_description)
    const { data: nameMatches } = await supabase
      .from('agents')
      .select('id')
      .ilike('name', `%${q}%`)
      .eq('is_active', true)

    const nameMatchIds = (nameMatches ?? []).map((a: Record<string, unknown>) => a.id as string)

    const orParts = [
      `fts_vector.plfts(simple).${q}`,
      `capability_description.ilike.%${q}%`,
    ]
    if (nameMatchIds.length > 0) {
      orParts.push(`agent_id.in.(${nameMatchIds.join(',')})`)
    }
    query = (query as ReturnType<typeof query.eq>).or(orParts.join(','))
  }

  // Rank by rating desc (deterministic ordering)
  const { data, error } = await query.order('agents(rating_avg)', { ascending: false })

  if (error) {
    console.error('[search] query error:', error.message, error.details, error.hint)
    return Response.json({ results: [], total: 0, limit, offset })
  }

  let rows = data ?? []

  // Phase B: semantic re-ranking (feature flag, only when q is provided and results are few)
  if (semantic && q && rows.length < 50) {
    try {
      const { generateEmbedding } = await import('@/lib/agents/embedding')
      void generateEmbedding
      // pgvector re-ranking would go here; falls back to FTS ranking silently
    } catch {
      // Semantic search not available — FTS results stand
    }
  }

  // Deduplicate by agent: keep the best-ranked manifest per agent
  const agentMap = new Map<string, { agent: Record<string, unknown>; manifest: Record<string, unknown> }>()
  for (const row of rows as Array<Record<string, unknown>>) {
    const agent   = row.agents as Record<string, unknown>
    const agentId = agent.id as string
    if (!agentMap.has(agentId)) {
      agentMap.set(agentId, {
        agent,
        manifest: {
          id:                     row.id,
          capability_description: row.capability_description,
          input_schema:           row.input_schema,
          output_schema:          row.output_schema,
          pricing_model:          row.pricing_model,
          endpoint_url:           row.endpoint_url,
          tags:                   row.tags,
        },
      })
    }
  }

  // total = real distinct agent count across all matching results (before pagination)
  const total = agentMap.size

  // Apply pagination after deduplication for stable page semantics
  const allResults = Array.from(agentMap.values()).map(({ agent, manifest }) => ({
    agent_id:                  agent.id,
    agent_name:                agent.name,
    framework:                 agent.framework,
    rating_avg:                agent.rating_avg,
    contracts_completed_count: agent.contracts_completed_count,
    ratings_count:             agent.ratings_count,
    best_match_manifest:       manifest,
  }))

  const pagedResults = allResults.slice(offset, offset + limit)

  return Response.json({ results: pagedResults, total, limit, offset })
}

export function GET(req: NextRequest) {
  return withAgentAuth(searchAgents, 'search')(req)
}
