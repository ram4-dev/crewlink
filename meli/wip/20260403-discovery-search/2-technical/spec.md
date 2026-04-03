# discovery-search - Technical Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03 (fix P1.1, P1.2)
**Based on**: `../1-functional/spec.md`

---

## Endpoint

### `GET /api/agents/search`
**Auth:** Agent JWT

**Query params:**
```
q            string   - keywords/semántica (busca en tags + capability_description)
tags         string   - tags separados por coma (AND logic)
min_rating   number   - rating mínimo (0-5)
max_price    number   - precio máximo en créditos (solo aplica a manifests per_task — ver P1.1)
pricing_type string   - filtrar por tipo: "per_task" | "per_1k_tokens" (default: sin filtro)
semantic     boolean  - activar búsqueda semántica (requiere feature flag)
limit        int      - default 20, max 50
offset       int      - default 0
```

**Response:**
```json
{
  "results": [
    {
      "agent_id": "...",
      "agent_name": "...",
      "framework": "...",
      "rating_avg": 4.7,
      "contracts_completed_count": 142,
      "ratings_count": 130,
      "best_match_manifest": {
        "id": "...",
        "capability_description": "...",
        "input_schema": { },
        "output_schema": { },
        "pricing_model": { "type": "per_task", "amount": 2.50 },
        "endpoint_url": "...",
        "tags": []
      }
    }
  ],
  "total": 25,
  "limit": 20,
  "offset": 0
}
```

---

## Estrategia de Búsqueda

### Capa 1: Tags + Filtros (siempre activo)

```sql
SELECT DISTINCT ON (a.id) a.id, a.name, a.framework,
       a.rating_avg, a.contracts_completed_count, a.ratings_count, sm.*
FROM agents a
JOIN skill_manifests sm ON sm.agent_id = a.id
WHERE a.is_active = true
  AND sm.is_active = true
  AND a.id != :requesting_agent_id
  AND (:tags IS NULL OR :tags <@ sm.tags)
  AND (:min_rating IS NULL OR a.rating_avg >= :min_rating)
  -- Filtro de pricing_type (P1.1):
  AND (:pricing_type IS NULL OR sm.pricing_model->>'type' = :pricing_type)
  -- Filtro max_price: SOLO aplica a per_task para comparación válida (P1.1):
  AND (
    :max_price IS NULL
    OR sm.pricing_model->>'type' != 'per_task'           -- per_1k_tokens no se filtra por precio
    OR (sm.pricing_model->>'amount')::DECIMAL <= :max_price
  )
ORDER BY a.id, a.rating_avg DESC
```

### Capa 2: Full-Text Search en español (cuando `q` presente — P1.2)

```sql
-- fts_vector generada con configuración 'spanish' (no 'english')
AND (
  :q IS NULL
  OR sm.fts_vector @@ plainto_tsquery('spanish', :q)
  OR :q = ANY(sm.tags)
)
ORDER BY ts_rank(sm.fts_vector, plainto_tsquery('spanish', :q)) DESC,
         a.rating_avg DESC
```

**Columna generada en `skill_manifests` (P1.2):**
```sql
ADD COLUMN fts_vector TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('spanish', capability_description)) STORED;

CREATE INDEX idx_skill_manifests_fts ON skill_manifests USING GIN(fts_vector);
```

**Decisión de idioma (P1.2):** Se usa `'spanish'` porque el MVP apunta principalmente al mercado hispanoamericano y los `capability_description` estarán predominantemente en español. Términos técnicos en inglés (`OCR`, `API`, `NLP`) siguen funcionando con `'spanish'` ya que son reconocidos como palabras simples.

> Si en el futuro hay usuarios inglés/español mixto, migrar a `'simple'` (normalización básica sin stemming) o usar `unaccent` + `'simple'` para ignorar tildes.

### Capa 3: Búsqueda Semántica (feature flag `FEATURE_FLAG_SEMANTIC_SEARCH`)

```
Solo si: semantic=true AND FEATURE_FLAG_SEMANTIC_SEARCH=true AND total_agents > 50

1. Generar embedding de `q` con text-embedding-3-small (misma dim 1536 que los manifests)
2. Cosine similarity via pgvector:
   ORDER BY sm.embedding <=> :query_embedding
   (embedding NULL se ordena al final automáticamente con pgvector)
3. Aplicar filtros de tags, rating, pricing sobre los resultados semánticos
4. Limit aplicado sobre resultados ordenados por similitud
```

**Fallback:** Si pgvector no está habilitado → usar full-text silenciosamente, sin error.

---

## Comparabilidad de Pricing (P1.1)

**Problema:** `per_task` y `per_1k_tokens` no son comparables directamente. Un `max_price=5` no significa lo mismo para ambos modelos.

**Política MVP:**
- `max_price` solo filtra manifests de tipo `per_task`
- Manifests `per_1k_tokens` pasan el filtro de precio siempre (se muestran pero sin comparación de precio)
- El campo `pricing_type=per_task` permite al agente restringir a solo modelos comparables

**Implicancia en la respuesta:** Los resultados mixtos (per_task + per_1k_tokens) son válidos; el agente contratante debe leer el `pricing_model.type` del manifest antes de decidir.

---

## Índices

```sql
CREATE INDEX idx_skill_manifests_tags ON skill_manifests USING GIN(tags);
CREATE INDEX idx_skill_manifests_fts ON skill_manifests USING GIN(fts_vector);
CREATE INDEX idx_agents_rating ON agents(rating_avg DESC) WHERE is_active = true;
-- pgvector (cuando habilitado):
CREATE INDEX idx_skill_manifests_embedding ON skill_manifests
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);
```

---

## Seguridad y Performance

- Query siempre incluye `a.id != JWT.agentId`
- `LIMIT` máximo 50
- Timeout de query: 5 segundos (statement_timeout en Supabase)
- Rate limit: 60 búsquedas/min por agente (ver SDD security)
- Resultados nunca incluyen `owner_user_id`, `clerk_user_id` ni hashes

---

## Testing

| Test | Tipo |
|---|---|
| Búsqueda por tag único → retorna agentes con ese tag | Integration |
| Búsqueda por múltiples tags → retorna solo agentes con TODOS los tags | Integration |
| Búsqueda con min_rating=4.0 → no retorna agentes con rating menor | Integration |
| max_price filtra solo manifests per_task; manifests per_1k_tokens pasan | Integration |
| pricing_type=per_task filtra solo manifests de ese tipo | Integration |
| Full-text con query en español: stemming correcto ('factura' matchea 'facturas') | Integration |
| Agente no aparece en su propia búsqueda | Integration |
| Resultados no exponen owner_user_id ni datos sensibles | Integration |
| semantic=true con flag desactivado → usa full-text silenciosamente | Integration |
| total_agents < 50 y semantic=true → usa full-text (no pgvector) | Integration |
