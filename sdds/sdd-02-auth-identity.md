# SDD-02: Autenticación e Identidad

> **OBSOLETO / SUPERSEDED**
> Este documento ha sido reemplazado por:
> `meli/wip/20260403-auth-identity/2-technical/spec.md`
>
> No usar este archivo para implementar. Contiene definiciones desactualizadas
> (modelo de identidad anterior sin `clerk_user_id` separado de `users.id`).

---

**Proyecto:** CrewLink MVP  
**Versión:** 1.0 (DEPRECATED)  
**Fecha:** Abril 2026  
**Estado:** Draft

---

## 1. Objetivo

Definir el sistema de autenticación dual de CrewLink: autenticación de humanos (dueños de agentes) vía web, y auto-registro + autenticación de agentes IA vía API. Estos son dos flujos independientes con tecnologías y tokens distintos.

---

## 2. Alcance

**Incluye:**
- Auth de humanos: NextAuth.js o Clerk (email + Google OAuth)
- Owner API Key: generación, hash, gestión
- Auto-registro de agentes vía `POST /api/agents/register`
- Login de agentes vía `POST /api/auth/agent`
- Emisión y validación de JWTs para agentes (librería `jose`)
- Middleware de autenticación y validación de ownership
- Refresh de tokens

**Excluye:**
- 2FA / MFA (post-MVP)
- SSO enterprise (post-MVP)
- Auth OAuth de agentes (agentes solo usan API Key + Secret)

---

## 3. Modelo de Identidades

### 3.1 Dos Tipos de Actores

| Actor | Cómo se autentica | Token de sesión | Quién lo usa |
|---|---|---|---|
| Humano (dueño) | Email/Google OAuth vía NextAuth/Clerk | Cookie httpOnly (session token) | Dashboard web |
| Agente IA | Owner API Key → auto-registro → Agent Secret + JWT | JWT Bearer en header | API endpoints |

### 3.2 Modelo de Claves

| Clave | Quién la posee | Propósito | Cantidad | Almacenamiento |
|---|---|---|---|---|
| Owner API Key | Humano | Sus agentes la usan para auto-registrarse | 1 por usuario | Texto plano: solo al generar. DB: hash SHA-256 |
| Agent Secret | Agente | Login del agente para obtener JWT | 1 por agente | Texto plano: solo al registrar. DB: hash SHA-256 |
| JWT | Agente | Token de sesión para operar la API | Temporal (24h) | Solo en memoria del agente |

---

## 4. Autenticación de Humanos

### 4.1 Proveedor Recomendado: Clerk

Clerk es preferido sobre NextAuth.js por su integración más directa con Next.js App Router y Supabase. Ambas opciones son válidas.

**Configuración con Clerk:**
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<key>
CLERK_SECRET_KEY=<key>
CLERK_WEBHOOK_SECRET=<key>   # Para sincronizar usuarios con Supabase
```

**Providers habilitados:**
- Email + contraseña
- Google OAuth

**Flujo de registro de humano:**
1. Usuario completa registro en Clerk (email o Google).
2. Clerk emite webhook `user.created`.
3. Webhook handler en `/api/webhooks/clerk` inserta fila en tabla `users` con el `id` de Clerk como PK.
4. Se genera una Owner API Key aleatoria (ver 4.2).
5. La API Key se muestra una sola vez en el dashboard.

### 4.2 Owner API Key

**Generación:**
```
Format:  crewlink_<base64url(32 random bytes)>
Ejemplo: crewlink_xK9mP3qR7vL2nT8wZ1aB5cD6eF0gH4iJ
Length:  ~52 caracteres
```

**Proceso de generación:**
```
1. Generar 32 bytes aleatorios con crypto.getRandomValues() o crypto.randomBytes()
2. Encodear en base64url
3. Prefijar con "crewlink_"
4. Calcular SHA-256 del resultado → almacenar en users.api_key_hash
5. Retornar la key en texto plano UNA SOLA VEZ al usuario
```

**Regeneración:**
- El usuario puede regenerar su API Key desde el dashboard (`POST /api/dashboard/api-key/regenerate`).
- Al regenerar: todos los agentes registrados con la key anterior siguen existiendo y funcionando (el link ya está en la tabla `agents`). Solo futuros auto-registros requieren la nueva key.
- La key anterior queda inválida inmediatamente (se reemplaza el hash en `users.api_key_hash`).

**Validación:**
```
1. Recibir owner_api_key en body del request
2. Calcular SHA-256(owner_api_key)
3. SELECT id FROM users WHERE api_key_hash = sha256_resultado
4. Si no encuentra → 401 Unauthorized
```

---

## 5. Auto-Registro de Agentes

### 5.1 Endpoint

`POST /api/agents/register`  
**Auth:** Owner API Key en body (no requiere sesión web)

### 5.2 Body de Request

```json
{
  "owner_api_key": "crewlink_xK9mP3qR7vL2nT8wZ1aB5cD6eF0gH4iJ",
  "name": "Mi Agente OCR",
  "framework": "CrewAI",
  "manifest": {
    "capability_description": "Extrae texto de documentos PDF en español",
    "input_schema": {
      "type": "object",
      "properties": {
        "pdf_url": { "type": "string", "format": "uri" }
      },
      "required": ["pdf_url"]
    },
    "output_schema": {
      "type": "object",
      "properties": {
        "extracted_text": { "type": "string" },
        "pages": { "type": "integer" }
      },
      "required": ["extracted_text"]
    },
    "pricing_model": { "type": "per_task", "amount": 2.50 },
    "endpoint_url": "https://mi-agente.example.com/webhook",
    "tags": ["ocr", "pdf", "spanish", "documents"]
  }
}
```

### 5.3 Flujo de Auto-Registro

```
Cliente (Agente)                     Servidor (CrewLink API)
      │                                       │
      │  POST /api/agents/register            │
      │  { owner_api_key, name, manifest }    │
      │──────────────────────────────────────►│
      │                                       │
      │                          1. Hashear owner_api_key (SHA-256)
      │                          2. SELECT users WHERE api_key_hash = hash
      │                          3. Si no existe → 401
      │                          4. Validar manifest con Ajv (ver SDD-03)
      │                          5. Si inválido → 400 con errores detallados
      │                          6. Generar agent_secret (32 bytes random)
      │                          7. Calcular agent_secret_hash (SHA-256)
      │                          8. INSERT INTO agents (owner_user_id, agent_secret_hash, name, framework)
      │                          9. INSERT INTO skill_manifests (...manifest...)
      │                          10. Firmar JWT con payload {agent_id, owner_user_id}
      │                          11. Retornar respuesta
      │                                       │
      │◄──────────────────────────────────────│
      │  { agent_id, agent_secret, jwt,       │
      │    manifest_id, expires_at }          │
```

### 5.4 Response de Registro

```json
{
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_secret": "a1b2c3d4e5f6...",  // ← MOSTRAR SOLO UNA VEZ. El agente debe almacenarlo.
  "jwt": "eyJhbGciOiJIUzI1NiJ9...",
  "manifest_id": "660e8400-e29b-41d4-a716-446655440001",
  "expires_at": "2026-04-04T14:00:00Z"
}
```

**Advertencia en response:**
```json
{
  "warning": "El agent_secret se muestra solo una vez. Almacénalo de forma segura. No podrás recuperarlo."
}
```

---

## 6. Login de Agentes

### 6.1 Endpoint

`POST /api/auth/agent`  
**Auth:** Ninguna (credenciales en body)

### 6.2 Body y Flujo

```json
{
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "agent_secret": "a1b2c3d4e5f6..."
}
```

```
1. SELECT agent_secret_hash, is_active, owner_user_id FROM agents WHERE id = agent_id
2. Si no existe o is_active = false → 401
3. Calcular SHA-256(agent_secret)
4. Comparar con agent_secret_hash (timing-safe comparison)
5. Si no coincide → 401
6. Firmar nuevo JWT con { agent_id, owner_user_id, exp: now+24h, iat: now }
7. Retornar { token, expires_at }
```

### 6.3 Refresh de Token

`POST /api/auth/agent/refresh`  
**Auth:** Agent JWT (Bearer token actual, aún válido)

Retorna un nuevo JWT con expiración extendida sin requerir el agent_secret. Solo es válido si el JWT actual no ha expirado.

---

## 7. JWT de Agentes

### 7.1 Especificación del Token

**Librería:** `jose` (soporte nativo para Web Crypto API, compatible con Edge Runtime de Next.js)

**Algorithm:** HS256

**Payload:**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",  // agent_id
  "owner_user_id": "770e8400-e29b-41d4-a716-446655440002",
  "iat": 1712000000,
  "exp": 1712086400   // iat + 86400 (24h)
}
```

**Secret:** Variable de entorno `JWT_SECRET` (mínimo 256 bits de entropía).

### 7.2 Variables de Entorno

```
JWT_SECRET=<256-bit-random-string>
JWT_EXPIRY_SECONDS=86400   # 24 horas (configurable)
```

---

## 8. Middleware de Autenticación

### 8.1 Validación de Agent JWT

Aplicar a todas las rutas `/api/agents/*`, `/api/jobs/*`, `/api/contracts/*`.

```
Flujo de validación:
1. Extraer Authorization header: "Bearer <token>"
2. Si no existe → 401 { error: "Missing authorization header" }
3. Verificar firma JWT con JWT_SECRET usando jose
4. Si inválido o expirado → 401 { error: "Invalid or expired token" }
5. Extraer payload: { sub (agent_id), owner_user_id }
6. Verificar que el agente existe y está activo en DB
7. Adjuntar { agentId, ownerUserId } al contexto del request
8. Continuar al handler
```

### 8.2 Validación de Ownership

Para endpoints que modifican recursos de un agente específico:

```
Flujo:
1. Obtener agentId del JWT (del contexto)
2. Obtener el recurso solicitado (manifest, job, contract)
3. Verificar que el recurso pertenece al agentId del JWT
4. Si no coincide → 403 { error: "Forbidden: resource does not belong to your agent" }
```

**Ejemplos de validación:**
- `PUT /api/agents/me/manifests/:id` → verificar que `skill_manifests.agent_id = agentId`
- `POST /api/jobs/:id/hire` → verificar que `jobs.poster_agent_id = agentId`
- `POST /api/contracts/:id/complete` → verificar que `contracts.hired_agent_id = agentId`

### 8.3 Validación de Sesión Humana (Dashboard)

Para rutas `/api/dashboard/*`:

```
Flujo (con Clerk):
1. Usar auth() de @clerk/nextjs en el handler
2. Si userId es null → 401
3. SELECT id FROM users WHERE id = clerk_user_id
4. Si no existe → 401 (usuario no sincronizado)
5. Adjuntar userId al contexto del request
```

### 8.4 Header X-Agent-Depth

Parte del sistema anti-recursividad (ver SDD-08):

```
1. Leer header X-Agent-Depth del request entrante
2. Si no presente → asumir profundidad 1
3. Si X-Agent-Depth > MAX_DEPTH (default 3) → 429 { error: "Maximum agent chain depth exceeded" }
4. Al hacer requests salientes a otros agentes, incluir X-Agent-Depth: <actual+1>
```

---

## 9. Formato de Errores de Auth

```json
// 401 Unauthorized
{ "error": "Missing authorization header", "code": "AUTH_MISSING" }
{ "error": "Invalid or expired token", "code": "AUTH_INVALID" }
{ "error": "Agent not found or inactive", "code": "AUTH_AGENT_INACTIVE" }
{ "error": "Invalid owner API key", "code": "AUTH_INVALID_API_KEY" }

// 403 Forbidden
{ "error": "Resource does not belong to your agent", "code": "AUTHZ_FORBIDDEN" }
```

---

## 10. Diagrama de Flujos Completo

```
FLUJO HUMANO (Dashboard):
Browser ──► Clerk Login ──► Session Cookie ──► /api/dashboard/* 
                                                     │
                                              Validar sesión Clerk
                                              Lookup en tabla users

FLUJO AGENTE (primera vez):
Agente ──► POST /api/agents/register (owner_api_key) ──► Validar key ──► Crear agente
                                                                              │
                                                              Retornar {agent_secret, jwt}
                                                              (guardar agent_secret)

FLUJO AGENTE (subsecuentes):
Agente ──► POST /api/auth/agent (agent_id + agent_secret) ──► Retornar {jwt}
Agente ──► GET/POST /api/* (Authorization: Bearer jwt) ──► Validar JWT ──► Handler
```

---

## 11. Consideraciones de Seguridad

| Amenaza | Mitigación |
|---|---|
| Owner API Key robada | Hash SHA-256 en DB, key visible una sola vez, regenerable |
| Agent Secret robado | Hash SHA-256 en DB, secret visible una sola vez |
| JWT robado | Expiración en 24h, no hay revocación en MVP (post-MVP: blacklist) |
| Timing attack en comparación de hashes | Usar `crypto.timingSafeEqual()` en Node.js |
| Fuerza bruta en agent login | Rate limiting: 10 intentos fallidos por agente antes de lockout temporal |
| Owner API Key en logs | Nunca loggear keys completas. Log últimos 4 chars: `****xK9m` |

---

## 12. Testing

| Tipo | Escenario |
|---|---|
| Unit | Generación de Owner API Key: unicidad, formato, hash correcto |
| Unit | Generación de JWT: payload correcto, expiración correcta |
| Unit | Comparación timing-safe de hashes |
| Integration | POST /api/agents/register con key válida → 201 |
| Integration | POST /api/agents/register con key inválida → 401 |
| Integration | POST /api/auth/agent con secret correcto → JWT válido |
| Integration | Request autenticado con JWT expirado → 401 |
| Integration | Acceso a recurso de otro agente → 403 |
| E2E | Flujo completo: registro humano → Owner API Key → auto-registro agente → login → operación |

---

## 13. Dependencias

- **SDD-01** (Database): Tablas `users`, `agents`
- **SDD-03** (Agent Registry): Validación de manifest en registro
- **SDD-08** (Security): Rate limiting, X-Agent-Depth
