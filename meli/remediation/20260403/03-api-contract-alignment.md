# Spec de Remediación 03

## API Contract Alignment

Fecha: 2026-04-03
Prioridad: P1
Ámbito: `discovery-search`, `dashboard`, `auth-identity`, `jobs-applications`, `contracts-escrow`

---

## Problema

Hay drift entre specs activas y respuestas reales de la API. No son bugs catastróficos de seguridad, pero sí rompen:

- integraciones cliente;
- paginación;
- semántica de filtros;
- consistencia entre documentación y comportamiento real.

---

## Decisiones

### D1. Los contratos de respuesta son parte del producto

Toda respuesta documentada en spec activa debe considerarse estable.

Cambios permitidos:

- agregar campos opcionales no sensibles;
- aclarar naming.

Cambios no permitidos sin actualizar spec:

- alterar semántica de `total`;
- omitir campos prometidos;
- cambiar orden funcional relevante;
- cambiar una ruta de pública a autenticada o viceversa.

### D2. Search debe cumplir semántica de discovery, no solo “query que anda”

`GET /api/agents/search` debe cumplir simultáneamente:

- exclusión del agente solicitante;
- filtro AND por tags;
- búsqueda `q` en descripción y tags;
- paginación coherente;
- `best_match_manifest` estable por orden de ranking.

### D3. Dashboard debe reflejar estado operativo real

Las APIs de dashboard no pueden devolver vistas que contradigan decisiones de operación:

- contratos pendientes primero;
- agents con contexto suficiente para decidir activación;
- credits con conversión consistente con configuración.

---

## Contratos obligatorios

### C1. `GET /api/agents/search`

Requisitos:

1. `q` debe matchear:
   - `fts_vector` de `capability_description`, o
   - tags exactos o normalizados según política definida.
2. `total` debe representar el total real de resultados deduplicados antes de aplicar `limit/offset`.
3. si `semantic=true` y la feature flag está desactivada, el fallback a full-text debe ser explícito en implementación y tests.
4. el ranking debe ser determinista.

Recomendación:

- separar la consulta en dos fases:
  - fase A: seleccionar y rankear manifests;
  - fase B: deduplicar por agente y calcular total estable.

### C2. `GET /api/dashboard/contracts`

Requisitos:

- `pending_approval` debe aparecer primero;
- luego el resto por `created_at DESC`;
- el orden no puede depender de orden alfabético de `status`.

### C3. `GET /api/dashboard/agents`

Requisitos:

- incluir `active_contracts` o el campo equivalente documentado;
- mantener exposición solo de agentes del owner autenticado.

### C4. `GET /api/dashboard/credits`

Requisitos:

- `balance_usd` debe derivarse de `CREDITS_PER_USD`;
- no se permite hardcodear `100`.

### C5. `withSessionAuth`

Si el middleware promete contexto enriquecido en spec, debe cumplirlo o el spec debe ajustarse.

Opción recomendada:

- adjuntar `userId`, `clerkUserId`, `creditsBalance`, `approvalThreshold` si esos valores se usan de forma recurrente.

Si no se adopta:

- reducir la promesa del spec a lo que realmente expone el middleware.

---

## Normalización de rutas públicas/privadas

El comportamiento de middleware global y wrappers por ruta debe ser consistente.

Regla:

- una ruta pública por `middleware.ts` no debe terminar requiriendo sesión humana por diseño oculto;
- una ruta protegida por contracto no debe quedar pública por matcher permisivo.

Para este paquete de remediación, revisar explícitamente:

- `/api/jobs`
- `/api/agents/search`
- `/api/agents/:id`
- `/api/dashboard/*`

El resultado esperado debe quedar documentado en los specs activos y en tests.

---

## Variables y feature flags

Las rutas que dependan de flags deben usar nombres canónicos definidos en la spec de hardening:

- `FEATURE_FLAG_SEMANTIC_SEARCH`
- `MAX_AGENT_CHAIN_DEPTH`

No se admiten nombres divergentes entre search, registry y jobs.

---

## Testing obligatorio

- search con `q` por tag retorna match aunque el término no esté en descripción;
- search `total` refleja dataset completo deduplicado, no solo página actual;
- dashboard contracts lista `pending_approval` primero;
- dashboard agents expone `active_contracts`;
- credits usa `CREDITS_PER_USD` configurable;
- middleware y auth wrappers coinciden con la política de acceso documentada.

---

## Definition of Done

- search vuelve a cumplir el contrato funcional documentado;
- dashboard refleja orden y campos prometidos por spec;
- no quedan env vars divergentes en rutas afectadas;
- middleware global y auth por endpoint no se contradicen;
- los specs activos actualizados coinciden con respuestas reales de API.
