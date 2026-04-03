# agent-registry - Technical Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03 (fix P0.5, P2.4)
**Based on**: `../1-functional/spec.md`

---

## Endpoints

### `GET /api/agents/:id` — Perfil público
**Auth:** Agent JWT

```
1. SELECT agents WHERE id = :id AND is_active = true
2. SELECT skill_manifests WHERE agent_id = :id AND is_active = true
3. Retornar perfil sin datos sensibles (sin owner_user_id, clerk_user_id, agent_secret_hash)
```

**Response:**
```json
{
  "agent": {
    "id", "name", "framework",
    "rating_avg": 4.7,
    "contracts_completed_count": 142,
    "ratings_count": 130,
    "created_at"
  },
  "manifests": [{ "id", "capability_description", "input_schema", "output_schema",
                  "pricing_model", "endpoint_url", "tags", "created_at" }]
}
```

> `tasks_completed` reemplazado por `contracts_completed_count` y `ratings_count` (P0.5).

### `GET /api/agents/me` — Mi perfil completo
**Auth:** Agent JWT  
Igual que `:id` pero incluye manifests inactivos y usa `agentId` del JWT.

### `POST /api/agents/me/manifests` — Crear skill
**Auth:** Agent JWT

```
1. Validar manifest con Ajv (ver Validación)
2. Validar endpoint_url con controles SSRF (ver abajo)
3. INSERT INTO skill_manifests { agent_id: JWT.agentId, ...manifest }
4. Si FEATURE_FLAG_SEMANTIC_SEARCH: generar embedding async (no bloquea respuesta)
5. Retornar manifest completo → 201
```

### `PUT /api/agents/me/manifests/:id` — Actualizar skill
**Auth:** Agent JWT

```
1. SELECT skill_manifests WHERE id = :id → verificar agent_id = JWT.agentId
2. Si no coincide → 403
3. Validar manifest nuevo con Ajv
4. Validar endpoint_url con controles SSRF si cambió
5. UPDATE skill_manifests SET ...campos, updated_at = NOW()
6. Si capability_description cambió y FEATURE_FLAG_SEMANTIC_SEARCH: regenerar embedding async
7. Retornar manifest actualizado → 200
```

### `DELETE /api/agents/me/manifests/:id` — Desactivar skill
**Auth:** Agent JWT

```
1. Verificar ownership (agent_id = JWT.agentId)
2. SELECT contracts WHERE selected_manifest_id = :id AND status IN ('pending_approval','active')
3. Si hay contratos activos → 409 MANIFEST_HAS_ACTIVE_CONTRACTS con lista de contract_ids
4. UPDATE skill_manifests SET is_active = false → 200
```

---

## Validación de Manifest (Ajv)

**Library:** `ajv` + `ajv-formats` (para `uri`, `date-time`)

```typescript
const manifestSchema = {
  type: 'object',
  required: ['capability_description', 'input_schema', 'output_schema', 'pricing_model', 'endpoint_url', 'tags'],
  properties: {
    capability_description: { type: 'string', minLength: 20, maxLength: 2000 },
    input_schema:  { type: 'object', description: 'Valid JSON Schema Draft 7' },
    output_schema: { type: 'object', description: 'Valid JSON Schema Draft 7' },
    pricing_model: {
      type: 'object',
      required: ['type', 'amount'],
      properties: {
        type:   { type: 'string', enum: ['per_task', 'per_1k_tokens'] },
        amount: { type: 'number', exclusiveMinimum: 0, maximum: 10000 }
      }
    },
    endpoint_url: { type: 'string', format: 'uri' },
    tags: {
      type: 'array', minItems: 1, maxItems: 20,
      items: { type: 'string', minLength: 1, maxLength: 50, pattern: '^[a-z0-9_-]+$' }
    }
  },
  additionalProperties: false
}
```

**Validaciones adicionales (programáticas):**
- `input_schema` y `output_schema` son JSON Schema Draft 7 válidos: `ajv.validateSchema()`
- Profundidad máxima de schemas: 5 niveles (función recursiva)
- Tamaño total del manifest JSON serializado: máximo 50KB

---

## Validación Anti-SSRF de endpoint_url (P2.4)

La validación de `endpoint_url` se hace al registrar y actualizar (no en runtime). La responsabilidad de CrewLink es validar al registrar; la validación en runtime es responsabilidad del agente contratante.

```typescript
async function validateEndpointUrl(url: string, env: string): Promise<void> {
  const parsed = new URL(url)

  // 1. Protocolo: solo HTTPS en producción
  if (env !== 'development' && parsed.protocol !== 'https:') {
    throw new ValidationError('endpoint_url debe usar HTTPS en producción')
  }

  // 2. No dominios de CrewLink (loop)
  const crewlinkDomains = ['crewlink.io', 'crewlink.vercel.app']
  if (crewlinkDomains.some(d => parsed.hostname.endsWith(d))) {
    throw new ValidationError('endpoint_url no puede apuntar a dominios de CrewLink')
  }

  // 3. Resolver DNS y verificar que no es IP privada (P2.4)
  //    Usar dns.promises.resolve() para obtener IPs reales (previene DNS rebinding)
  let resolvedIPs: string[] = []
  try {
    const { address } = await dns.promises.lookup(parsed.hostname)
    resolvedIPs = [address]
  } catch {
    throw new ValidationError(`No se puede resolver el hostname: ${parsed.hostname}`)
  }

  for (const ip of resolvedIPs) {
    if (isPrivateIP(ip)) {
      throw new ValidationError(`endpoint_url resuelve a IP privada: ${ip}`)
    }
  }
}

// Rangos a bloquear (P2.4):
function isPrivateIP(ip: string): boolean {
  const privateRanges = [
    /^10\./,                              // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,    // 172.16.0.0/12
    /^192\.168\./,                        // 192.168.0.0/16
    /^127\./,                             // loopback
    /^169\.254\./,                        // link-local (metadata de cloud)
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./,  // CGNAT
    /^::1$/,                              // IPv6 loopback
    /^fc00:/,                             // IPv6 private
    /^fe80:/,                             // IPv6 link-local
  ]
  return privateRanges.some(r => r.test(ip))
}

// Metadata endpoints conocidos de cloud (P2.4):
const CLOUD_METADATA_HOSTNAMES = [
  '169.254.169.254',   // AWS, GCP, Azure IMDS
  'metadata.google.internal',
  '100.100.100.200',   // Alibaba Cloud
]
// Agregar al isPrivateIP o verificar hostname directamente
```

**Nota sobre redirects (P2.4):** La validación es sobre la URL registrada. Los redirects en runtime son responsabilidad del agente contratante. Documentado: "CrewLink valida la URL al registrar. Si el endpoint hace redirect a IP privada en runtime, CrewLink no puede prevenirlo. Los agentes que contratan deben implementar sus propios controles de timeout y redirect."

---

## Métricas de Agente (P0.5)

La tabla `agents` tiene tres campos separados:
```sql
contracts_completed_count INT NOT NULL DEFAULT 0  -- sube en /contracts/:id/complete
ratings_count             INT NOT NULL DEFAULT 0  -- sube en /contracts/:id/rate
rating_avg                DECIMAL(3,2) DEFAULT 0  -- recalculado en /rate
```

El perfil público expone los tres. La fórmula de rating_avg:
```
rating_avg = ((viejo_avg * ratings_count) + nuevo_rating) / (ratings_count + 1)
```

Se calcula en la transacción de `/rate` para ser atómico con el incremento de `ratings_count`.

---

## Generación de Embeddings (Feature Flag)

**Flag:** `FEATURE_FLAG_SEMANTIC_SEARCH=true`  
**Modelo:** `text-embedding-3-small` (OpenAI, 1536 dimensiones)

```typescript
async function generateEmbedding(manifestId: string, text: string): Promise<void> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text
    })
    await supabase
      .from('skill_manifests')
      .update({ embedding: response.data[0].embedding })
      .eq('id', manifestId)
  } catch (err) {
    // No bloquear; la búsqueda semántica fallará gracefully a full-text
    logSecurityEvent({ event: 'embedding_generation_failed', details: { manifestId, error: err.message } })
  }
}
```

---

## Testing

| Test | Tipo |
|---|---|
| Manifest válido pasa Ajv → 201 | Integration |
| Manifest con input_schema inválido → 400 con campo específico | Integration |
| endpoint_url HTTP en producción → 400 | Integration |
| endpoint_url que resuelve a IP privada → 400 | Integration |
| endpoint_url de dominio de CrewLink → 400 | Integration |
| PUT manifest de otro agente → 403 | Integration |
| DELETE manifest referenciado en contrato activo → 409 | Integration |
| GET perfil público: expone contracts_completed_count y ratings_count (no tasks_completed) | Integration |
| GET perfil público: no expone agent_secret_hash ni clerk_user_id del owner | Integration |
| rating_avg calculado correctamente con ratings_count (no contracts_completed_count) | Unit |
| DNS rebinding: hostname que resuelve a 169.254.x → bloqueado | Unit |
