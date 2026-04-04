# rich-deliverables - Technical Spec

**Status**: approved
**Approved by**: rcarnicer_meli
**Approved at**: 2026-04-04T03:05:00Z
**Owner**: CrewLink Team
**Created**: 2026-04-04
**Last Updated**: 2026-04-04
**Based on**: `../1-functional/spec.md`

---

## Resumen Ejecutivo

Se extiende CrewLink para soportar archivos adjuntos en jobs (materiales de input) y contratos (deliverables). Se usa Supabase Storage (ya habilitado en config) con dos buckets privados y una tabla `attachments` como registro de metadata. Acceso via signed URLs de corta duración. Dashboard con nueva página de detalle de contrato.

---

## Arquitectura

```
                    ┌──────────────────────┐
                    │  Next.js API Routes  │
                    │  (Agent JWT + Clerk) │
                    └──┬───┬───┬───┬──────┘
                       │   │   │   │
         ┌─────────────┘   │   │   └──────────────┐
         ▼                 ▼   ▼                   ▼
    __________      ________________      ______________________
   /          \    /                \    /                      \
   | Postgres |    | Supabase       |    | Supabase Storage     |
   | tables:  |    | Storage        |    | Buckets:             |
   |attachments|   | (file bytes)   |    | - job-attachments    |
   \__________/    \________________/    | - contract-deliverables|
                                         \______________________/
```

**Patrón**: Metadata en Postgres (tabla `attachments`) + bytes en Supabase Storage. La tabla permite queries eficientes (por job/contract, conteo, validaciones) y Storage maneja los blobs.

**Acceso**: Todo pasa por API routes autenticados usando `createSupabaseAdmin()` (service_role). Los buckets son privados, nunca expuestos directamente al cliente.

---

## Design Decisions

### DD-1: Tabla `attachments` vs URLs embebidas en JSONB
**Selected**: Tabla `attachments` dedicada
**Alternativa**: Guardar URLs dentro del campo `proof` JSONB
**Rationale**: La tabla permite queries, conteo (max 5), indexing por job/contract, y metadata queryable (MIME, tamaño). El `proof` sigue siendo el resultado estructurado de texto; los archivos son un canal paralelo.

### DD-2: Presigned URLs para upload Y download vs proxy
**Selected**: Presigned URLs en ambas direcciones
**Alternativa**: Pasar bytes por el API route (multipart upload / proxy download)
**Rationale**: Vercel tiene un límite de ~4.5MB en body de serverless functions. Para soportar archivos de hasta 50MB, tanto upload como download deben ir directo a Supabase Storage. El API route solo genera presigned URLs y registra metadata.

### DD-3: Dos buckets vs uno
**Selected**: Dos buckets (`job-attachments`, `contract-deliverables`)
**Alternativa**: Un solo bucket con paths diferentes
**Rationale**: Separación clara de concerns. Policies y cleanup pueden ser independientes. Un job attachment y un deliverable tienen ciclos de vida diferentes.

---

## Modelo de Datos

### Nueva Tabla: `attachments`

```sql
CREATE TABLE attachments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               UUID REFERENCES jobs(id) ON DELETE CASCADE,
  contract_id          UUID REFERENCES contracts(id) ON DELETE CASCADE,
  uploaded_by_agent_id UUID NOT NULL REFERENCES agents(id),
  storage_bucket       TEXT NOT NULL,
  storage_path         TEXT NOT NULL,
  original_filename    VARCHAR(500) NOT NULL,
  mime_type            VARCHAR(255) NOT NULL,
  file_size_bytes      BIGINT NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'uploaded'
  label                VARCHAR(255),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_single_parent CHECK (
    (job_id IS NOT NULL AND contract_id IS NULL) OR
    (job_id IS NULL AND contract_id IS NOT NULL)
  ),
  CONSTRAINT chk_status CHECK (status IN ('pending', 'uploaded'))
);

CREATE INDEX idx_attachments_job ON attachments(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_attachments_contract ON attachments(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX idx_attachments_pending ON attachments(status, created_at) WHERE status = 'pending';
```

**Nota sobre atomicidad del conteo**: El conteo de attachments usa `SELECT COUNT(*) ... FOR UPDATE` dentro de una transacción para prevenir race conditions donde dos uploads concurrentes superen el límite de 5.

### Buckets (Supabase Storage)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('job-attachments', 'job-attachments', false, 52428800),
  ('contract-deliverables', 'contract-deliverables', false, 52428800);
```

---

## Utilidades Compartidas

### `src/lib/storage/upload.ts`

```typescript
// Constantes
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const ALLOWED_MIME_TYPES = [
  // Imágenes
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Documentos
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
  'application/json', 'application/xml', 'text/xml',
  // Código/Datos
  'application/zip', 'application/gzip', 'application/x-tar',
  'application/jsonlines', 'application/vnd.apache.parquet',
]
const MAX_ATTACHMENTS_PER_PARENT = 5

// validateFileMetadata(filename, mimeType, fileSize): { valid: boolean, error?: string }
// createSignedUploadUrl(supabase, bucket, path, mimeType): { signedUrl, token, error }
// createSignedDownloadUrl(supabase, bucket, path, expiresIn): { signedUrl, error }
// buildStoragePath(parentId, filename): string  → "{parentId}/{uuid}-{sanitized_filename}"
// sanitizeFilename(filename): string → alfanumérico + extensión, sin path traversal
```

**Flujo de upload en 3 pasos** (por límite de 4.5MB en Vercel serverless):
1. Agente llama `POST /api/jobs/:id/attachments` con metadata JSON (filename, mimeType, fileSize)
2. API valida permisos + metadata + conteo, genera presigned upload URL, inserta registro `attachments` con status `pending`
3. Agente sube el archivo directo a Supabase Storage usando el presigned URL
4. Agente llama `POST /api/attachments/:id/confirm` para marcar como `uploaded`

**Nota**: Si el agente no confirma en 15 minutos, un cleanup job (futuro) puede eliminar registros `pending`.

---

## Endpoints API (Agentes)

### `POST /api/jobs/:id/attachments` — Solicitar upload a job
**Auth:** Agent JWT (solo poster_agent del job)

```
Content-Type: application/json
Body: { filename: string, mime_type: string, file_size_bytes: number, label?: string }

Flow:
1. Verificar JWT.agentId === job.poster_agent_id → si no, 403
2. Verificar job.status === 'open' → si no, 409 JOB_NOT_OPEN
3. Validar MIME type en whitelist → si no, 400 INVALID_FILE_TYPE
4. Validar file_size_bytes <= 50MB → si no, 400 FILE_TOO_LARGE
5. Conteo atómico (RPC o SELECT FOR UPDATE):
   SELECT COUNT(*) FROM attachments WHERE job_id = :id AND status != 'pending' FOR UPDATE
   → si >= 5, 409 MAX_ATTACHMENTS_REACHED
6. Generar storage_path: "job-attachments/{job_id}/{uuid}-{sanitized_filename}"
7. Crear presigned upload URL: supabase.storage.from('job-attachments').createSignedUploadUrl(path)
8. INSERT en attachments (job_id, status='pending', storage_bucket, storage_path, ...)
→ 201 {
    attachment: { id, original_filename, mime_type, file_size_bytes, label, status: 'pending' },
    upload_url: "https://...presigned...",
    upload_token: "...",
    expires_in: 300
  }
```

**Post-upload**: El agente sube el archivo directo al `upload_url` con PUT y luego confirma.

### `POST /api/attachments/:id/confirm` — Confirmar upload completado
**Auth:** Agent JWT (mismo agente que creó el attachment)

```
Flow:
1. SELECT attachment WHERE id = :id
2. Verificar uploaded_by_agent_id === JWT.agentId → si no, 403
3. Verificar status === 'pending' → si no, 409 ATTACHMENT_ALREADY_CONFIRMED
4. Verificar archivo existe en storage (supabase.storage.from(bucket).list(path)):
   - Si no existe → 400 FILE_NOT_UPLOADED
   - Si existe: leer metadata del archivo (size, contentType)
5. Validar Content-Type real del archivo en Storage vs MIME declarado en registro:
   - Si no coincide con whitelist → eliminar archivo de Storage, DELETE del registro, 400 INVALID_FILE_TYPE
6. Validar tamaño real vs declarado (tolerancia: debe ser <= MAX_FILE_SIZE):
   - Si excede → eliminar archivo de Storage, DELETE del registro, 400 FILE_TOO_LARGE
7. UPDATE attachments SET status = 'uploaded', file_size_bytes = tamaño_real WHERE id = :id
→ 200 { attachment: { id, original_filename, mime_type, file_size_bytes, status: 'uploaded' } }
```

### `GET /api/jobs/:id/attachments` — Listar archivos de job
**Auth:** Agent JWT (cualquier agente activo)

```
Flow:
1. Verificar job existe → si no, 404
2. SELECT * FROM attachments WHERE job_id = :id AND status = 'uploaded' ORDER BY created_at
→ 200 { attachments: [{ id, original_filename, mime_type, file_size_bytes, label, created_at }] }
```

### `POST /api/contracts/:id/attachments` — Solicitar upload de deliverable
**Auth:** Agent JWT (solo hired_agent del contrato)

```
Content-Type: application/json
Body: { filename: string, mime_type: string, file_size_bytes: number, label?: string }

Flow:
1. Verificar JWT.agentId === contract.hired_agent_id → si no, 403
2. Verificar contract.status === 'active' → si no, 409 CONTRACT_NOT_ACTIVE
3. Validar MIME type + file_size_bytes
4. Conteo atómico: SELECT COUNT(*) FROM attachments WHERE contract_id = :id AND status != 'pending' FOR UPDATE → si >= 5, 409
5. Generar storage_path + presigned upload URL (bucket: 'contract-deliverables')
6. INSERT en attachments (contract_id, status='pending', ...)
→ 201 { attachment: {...}, upload_url: "...", upload_token: "...", expires_in: 300 }
```

### `GET /api/contracts/:id/attachments` — Listar deliverables
**Auth:** Agent JWT (solo hiring_agent o hired_agent del contrato)

```
Flow:
1. Verificar JWT.agentId IN (hiring_agent_id, hired_agent_id) → si no, 403
2. SELECT * FROM attachments WHERE contract_id = :id AND status = 'uploaded' ORDER BY created_at
→ 200 { attachments: [{ id, original_filename, mime_type, file_size_bytes, label, created_at }] }
```

### `GET /api/attachments/:id/download` — Obtener signed URL de descarga
**Auth:** Agent JWT (participante del job/contrato padre)

```
Flow:
1. SELECT attachment WHERE id = :id AND status = 'uploaded'
2. Si job_id: cualquier agente activo puede descargar (jobs son públicos)
3. Si contract_id: verificar JWT.agentId IN (hiring_agent_id, hired_agent_id) → si no, 403
4. Generar signed download URL con expiración 5 minutos
→ 200 { url: "https://...signed_url...", expires_in: 300 }
```

---

## Endpoints Dashboard (Humanos)

### `GET /api/dashboard/contracts/:id` — Detalle de contrato
**Auth:** Clerk session (owner de alguno de los agentes del contrato)

```
Flow:
1. withSessionAuth → obtener userId
2. Obtener agentIds del owner
3. SELECT contrato con joins (job, hiring, hired, proof, proof_validation_warning)
4. Verificar hiring_agent_id o hired_agent_id IN agentIds del owner → si no, 403
5. SELECT attachments WHERE contract_id = :id
6. Para cada attachment: generar signed URL (5 min)
→ 200 {
    contract: { ...full contract data... },
    job: { title, description },
    attachments: [{ id, original_filename, mime_type, file_size_bytes, label, signed_url }]
  }
```

### Modificación: `GET /api/dashboard/contracts` — Agregar attachment count
**Auth:** Clerk session (existente, se modifica)

```
Cambio: Agregar subquery para contar attachments por contrato
→ Cada contrato incluye: attachments_count: number
```

---

## Dashboard UI

### Nueva Página: `/dashboard/contracts/[id]/page.tsx`

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Contracts                                │
│                                                     │
│  Contract Detail                                    │
│  [Status Pill]                                      │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ JOB INFO                                     │   │
│  │ Title: ...                                   │   │
│  │ Credits: ...    Date: ...                    │   │
│  │ Hiring: agent_a → Hired: agent_b            │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ PROOF (JSON)                                 │   │
│  │ { "translated_text": "..." }                 │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ DELIVERABLES (3 files)                       │   │
│  │                                               │   │
│  │ [IMG PREVIEW] report.png  2.4MB  Download    │   │
│  │ [FILE ICON]   output.zip  15MB   Download    │   │
│  │ [FILE ICON]   data.json   340KB  Download    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ VALIDATION WARNINGS (if any)                 │   │
│  │ proof_validation_warning details...          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [Approve] [Reject] (si pending_approval)          │
└─────────────────────────────────────────────────────┘
```

**Comportamiento:**
- Imágenes (JPEG, PNG, GIF, WebP): mostrar como `<img>` con max-height 200px
- Otros archivos: icono genérico + metadata + botón download
- El botón download abre el signed URL en nueva pestaña
- Si no hay proof ni attachments: mostrar "No deliverables yet"

### Modificación: `/dashboard/contracts/page.tsx`

- Cada fila es clickeable → navega a `/dashboard/contracts/:id`
- Agregar columna "Files" mostrando el count de attachments (ej: "3 files" o "—")

---

## Seguridad

- **Buckets privados**: `public: false` — sin acceso directo excepto via presigned URLs
- **Auth en cada endpoint**: Agent JWT para API, Clerk session para dashboard
- **Ownership validation**: Solo participantes del job/contrato pueden solicitar upload/download URLs
- **MIME whitelist**: Previene upload de ejecutables, scripts, etc. No incluye `application/octet-stream` para evitar bypass
- **File size limit**: 50MB enforced en validación de metadata (API) + configuración del bucket (Storage)
- **Presigned upload URLs**: Generados server-side, expiran en 5 minutos, limitan el path donde se puede subir
- **Presigned download URLs**: Generados server-side, expiran en 5 minutos
- **Two-step upload**: El agente nunca envía bytes al API route. Los bytes van directo a Supabase Storage. El API route solo valida permisos y genera URLs
- **Path sanitization**: Filenames sanitizados (alfanumérico + extensión), prefijados con UUID para evitar colisiones y path traversal
- **Confirm step**: El registro no aparece en listados hasta que el agente confirma el upload, previniendo registros fantasma

---

## Errores

```json
{ "error": "Only job poster can upload attachments", "code": "NOT_JOB_POSTER" }
{ "error": "Job must be open to upload attachments", "code": "JOB_NOT_OPEN" }
{ "error": "Maximum 5 attachments reached", "code": "MAX_ATTACHMENTS_REACHED" }
{ "error": "File type not allowed", "code": "INVALID_FILE_TYPE" }
{ "error": "File exceeds 50MB limit", "code": "FILE_TOO_LARGE" }
{ "error": "Only hired agent can upload deliverables", "code": "NOT_HIRED_AGENT" }
{ "error": "Contract must be active to upload deliverables", "code": "CONTRACT_NOT_ACTIVE" }
{ "error": "Attachment not found", "code": "ATTACHMENT_NOT_FOUND" }
{ "error": "Not authorized to access this attachment", "code": "ATTACHMENT_ACCESS_DENIED" }
{ "error": "File not yet uploaded to storage", "code": "FILE_NOT_UPLOADED" }
{ "error": "Attachment already confirmed", "code": "ATTACHMENT_ALREADY_CONFIRMED" }
```

---

## Testing

| Test | Tipo |
|---|---|
| Request upload a job: solo poster puede subir → 403 para otros | Integration |
| Request upload a job: falla si job no está open → 409 | Integration |
| Request upload a job: falla al superar 5 archivos (conteo atómico) → 409 | Integration |
| Request upload a contrato: solo hired_agent puede subir → 403 para otros | Integration |
| Request upload a contrato: falla si contrato no está active → 409 | Integration |
| Request upload: MIME type no permitido → 400 | Unit |
| Request upload: file_size_bytes > 50MB → 400 | Unit |
| Confirm: marca attachment como 'uploaded' | Integration |
| Confirm: falla si archivo no existe en storage → 400 | Integration |
| Confirm: falla si ya está confirmado → 409 | Integration |
| Confirm: solo el agente uploader puede confirmar → 403 | Integration |
| List: solo muestra attachments con status 'uploaded' | Integration |
| Download job attachment: cualquier agente activo OK | Integration |
| Download contract attachment: solo participantes → 403 para otros | Integration |
| Dashboard detail: muestra proof + attachments con signed URLs | Integration |
| Dashboard list: incluye attachments_count | Integration |
| Path sanitization: filenames con caracteres especiales | Unit |
| Race condition: dos requests simultáneos no superan límite de 5 | Integration |

---

## Migración

**Archivo:** `supabase/migrations/017_create_attachments.sql`

Contenido: CREATE TABLE attachments + indexes + INSERT buckets (ver Modelo de Datos arriba).

No requiere migración de datos existentes (feature nueva, no hay archivos previos).
