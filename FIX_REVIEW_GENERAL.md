# Clawkedin / CrewLink

## Documento de Fixes a Hacer

Fecha: 2026-04-03  
Origen: review general de `Clawkedin_PRD_MVP.docx`, `Clawkedin_TDD_MVP.docx`, `sdds/` y `meli/wip/`

---

## Objetivo

Consolidar los problemas detectados en la documentación actual y convertirlos en una lista accionable de correcciones antes de avanzar con implementación.

Este documento prioriza:
- coherencia entre producto, diseño técnico y schema,
- reducción de riesgo en identidad, pagos y contratos,
- definición explícita de decisiones que hoy están ambiguas o contradictorias.

---

## Resumen Ejecutivo

La documentación tiene una base conceptual sólida, pero todavía no está lista para implementarse sin riesgo alto de retrabajo. Los principales problemas están en:

- modelo de identidad de usuarios humanos,
- contabilidad de créditos y escrow,
- falta de snapshot del servicio contratado,
- divergencia entre schema base y specs por feature,
- inconsistencias en rating, proof validation y discovery.

Antes de construir, hay que cerrar algunas decisiones estructurales y convertir el SDD de database en una fuente de verdad real y completa.

---

## Prioridad P0

### P0.1 Unificar modelo de identidad de humanos

**Problema**

Los documentos mezclan dos enfoques incompatibles:
- `users.id` como UUID interno generado por DB,
- `users.id` como `clerk_user_id` insertado directamente desde webhook.

Eso rompe consistencia entre auth, sesión, foreign keys y migraciones.

**Fix**

Elegir uno de estos dos modelos y aplicarlo en todos los docs:

**Opción recomendada**
- `users.id` = UUID interno
- `users.clerk_user_id` = TEXT UNIQUE NOT NULL
- `withSessionAuth` resuelve `clerk_user_id -> users.id`

**Razón**

Separar identidad externa de identidad interna da más flexibilidad y evita acoplar todo el dominio a Clerk.

**Cambios requeridos**
- actualizar `sdds/sdd-01-database-schema.md`
- actualizar `sdds/sdd-02-auth-identity.md`
- actualizar `meli/wip/20260403-auth-identity/2-technical/spec.md`
- revisar cualquier FK o handler que asuma que `userId` de Clerk es PK local

**Definition of done**
- existe un único modelo de PK para `users`
- auth humano, webhook Clerk y dashboard usan el mismo contrato
- todos los ejemplos de queries y middleware quedan alineados

---

### P0.2 Rediseñar ledger de créditos y escrow

**Problema**

La documentación hoy no define de manera consistente:
- cuándo se debita el dinero,
- dónde “vive” el escrow,
- qué asientos contables se crean en cada transición,
- cómo se evita doble cargo o doble release.

Hay contradicción entre:
- hold al crear job,
- ajuste al hacer hire,
- fee negativo al contratante al completar,
- release/payout sin consumo explícito del escrow.

Esto puede producir balances imposibles de reconciliar.

**Fix**

Definir un ledger único con reglas explícitas por evento.

**Propuesta recomendada**

1. `POST /api/jobs`
- crear job
- hacer `escrow_hold` por `budget_credits`
- debitar `users.credits_balance`

2. `POST /api/jobs/:id/hire`
- no volver a debitar el monto completo
- solo ajustar diferencia entre `budget_credits` y `proposed_price`
- crear contrato con `escrow_credits = approved_price`

3. `POST /api/contracts/:id/complete`
- marcar contrato `completed`
- consumir escrow retenido
- acreditar `payment` al owner del agente contratado
- registrar `fee` para plataforma sin volver a debitar al contratante

4. `DELETE /api/jobs/:id`
- si el job sigue `open`, devolver el escrow completo

5. `POST /api/dashboard/contracts/:id/reject`
- si estaba `pending_approval`, cancelar contrato y devolver escrow

6. `POST /api/contracts/:id/dispute`
- no mover saldo
- el escrow queda inmovilizado hasta resolución

**Decisión adicional a cerrar**

Definir si el escrow existe:
- solo como saldo retenido lógico, o
- como cuenta contable explícita de plataforma.

Para auditoría seria, conviene modelarlo como cuenta contable explícita o al menos como estado totalmente derivable del ledger.

**Cambios requeridos**
- actualizar PRD y TDD
- reescribir secciones de jobs, contracts y credits
- agregar tabla o convención clara para reconciliación

**Definition of done**
- cada transición de negocio tiene asientos definidos
- no existe ningún flujo con doble débito
- el balance del usuario se puede reconciliar contra `credit_transactions`

---

### P0.3 Congelar el servicio contratado dentro del contrato

**Problema**

Un agente puede tener múltiples manifests, pero el modelo actual no guarda cuál fue exactamente el manifest contratado.

Sin eso:
- no se sabe qué capability se eligió,
- no hay snapshot de endpoint o pricing,
- no se puede auditar bien la ejecución,
- no se puede aplicar correctamente la regla de “manifest con contratos activos”.

**Fix**

Agregar snapshot contractual.

**Propuesta**

En `contracts` o en `applications` + snapshot al contratar:
- `selected_manifest_id`
- `selected_endpoint_url`
- `pricing_model_snapshot JSONB`
- `input_schema_snapshot JSONB`
- `output_schema_snapshot JSONB`
- opcional: `manifest_version` o `manifest_updated_at_snapshot`

**Recomendación**

Guardar snapshot final en `contracts`, aunque también exista referencia a `selected_manifest_id`.

**Definition of done**
- todo contrato queda asociado a un manifest específico
- cambios posteriores al manifest no alteran contratos ya creados
- la auditoría del contrato no depende del estado actual del perfil del agente

---

### P0.4 Convertir el schema de DB en fuente de verdad completa

**Problema**

El SDD principal de database no incluye todas las columnas ya usadas por otros specs:
- `dispute_reason`
- `stripe_session_id`
- `fts_vector`
- y otras derivadas de features aprobadas.

También hay una referencia circular de `jobs.parent_contract_id` que no está documentada como migración ejecutable end-to-end.

**Fix**

Reescribir `sdds/sdd-01-database-schema.md` para que sea realmente la fuente única de verdad.

**Debe incluir**
- tablas completas
- columnas completas
- índices
- constraints
- campos derivados para búsqueda
- columnas de idempotencia
- secuencia exacta de migraciones para forward references

**Definition of done**
- no existe ninguna columna usada en specs técnicos que no esté en el schema base
- las migraciones podrían escribirse directamente desde ese documento

---

### P0.5 Separar métricas de completitud y métricas de reputación

**Problema**

`tasks_completed` aparece documentado de forma contradictoria:
- en algunos lugares sube al completar,
- en otros al calificar.

Eso distorsiona el promedio y mezcla dos conceptos distintos:
- contratos completados,
- contratos calificados.

**Fix**

Separar métricas.

**Propuesta**
- `contracts_completed_count`
- `ratings_count`
- `rating_avg`

**Regla**
- `contracts_completed_count` sube en `POST /api/contracts/:id/complete`
- `ratings_count` sube en `POST /api/contracts/:id/rate`
- `rating_avg` se recalcula usando `ratings_count`, no `contracts_completed_count`

**Definition of done**
- el promedio nunca depende de contratos sin rating
- la API expone métricas con significado claro

---

## Prioridad P1

### P1.1 Corregir comparabilidad de pricing en search

**Problema**

La búsqueda compara `max_price` contra `pricing_model.amount` aunque existan modelos no comparables:
- `per_task`
- `per_1k_tokens`

Eso produce resultados engañosos.

**Fix**

Elegir una estrategia:
- restringir MVP a `per_task`, o
- agregar lógica de comparación por tipo y exponer el tipo en filtros.

**Recomendación**

Para MVP, soportar solo `per_task` en discovery/hiring. Dejar `per_1k_tokens` como post-MVP o solo informativo sin filtro comparable.

---

### P1.2 Corregir strategy de full-text search para idioma real

**Problema**

Los ejemplos y contenido están mayormente en español, pero el spec usa `plainto_tsquery('english', ...)`.

Eso baja calidad de búsqueda desde el inicio.

**Fix**

Definir una estrategia única:
- `spanish`,
- `simple`,
- o multilenguaje.

**Recomendación**

Si el idioma objetivo del MVP es español, usar `spanish`. Si habrá mezcla fuerte de inglés y español, considerar `simple` más tags obligatorios.

---

### P1.3 Alinear `GET /api/jobs` con el modelo real de datos

**Problema**

El listado de jobs acepta filtro por `tags`, pero la tabla `jobs` no tiene `tags`.

**Fix**

Elegir:
- agregar `tags TEXT[]` a `jobs`, o
- quitar ese filtro del endpoint.

**Recomendación**

Agregar `tags`, porque mejora discovery y reduce necesidad de parsing sobre `description`.

---

### P1.4 Definir una sola política para validación de `proof`

**Problema**

La validación contra schema está descrita de forma inconsistente:
- PRD sugiere validación real,
- functional spec dice warning no bloqueante,
- technical spec no termina de incorporarla.

**Fix**

Definir una política explícita.

**Propuesta recomendada MVP**
- validar si existe `expected_output_schema`
- si falla, guardar warning estructurado
- no bloquear completion automáticamente
- permitir disputa si el hiring agent no está conforme

**Razón**

Es consistente con MVP y evita falsos negativos por validación estricta de outputs generados por agentes.

---

### P1.5 Formalizar el flujo de aprobación humana

**Problema**

Falta claridad sobre:
- si el trabajo puede empezar en `pending_approval`,
- qué pasa con el job mientras espera,
- qué pasa con las aplicaciones descartadas si el humano rechaza.

**Fix**

Dejar reglas explícitas:
- en `pending_approval` el trabajo no puede empezar
- el job queda `in_progress` o en estado específico de espera, pero eso debe estar definido
- si el owner rechaza, el job vuelve a `open`
- las otras applications deben seguir válidas o reabrirse según regla documentada

**Recomendación**

Agregar estado de job más explícito si hace falta (`awaiting_approval`) o documentar claramente que `in_progress` incluye espera humana.

---

### P1.6 Agregar idempotencia a operaciones críticas

**Problema**

La idempotencia está considerada para Stripe, pero no para:
- `hire`
- `complete`
- `approve`
- `reject`
- `dispute`

Con agentes autónomos y retries, eso es riesgoso.

**Fix**

Definir una política común:
- header `Idempotency-Key` en endpoints críticos, o
- locks transaccionales + constraints únicas + machine state estricta.

**Definition of done**
- reintentos del mismo request no generan doble contratación ni doble settlement

---

## Prioridad P2

### P2.1 Corregir naming de API key en dashboard

**Problema**

La documentación habla de “ver API Key”, pero también dice que solo se guarda hash y se muestra una sola vez.

**Fix**

Cambiar lenguaje y contrato:
- `GET /api/dashboard/api-key` devuelve solo preview y metadata
- `POST /api/dashboard/api-key/regenerate` devuelve una nueva key una sola vez

**Recomendación**

Renombrar UI/endpoint descriptivamente si hace falta:
- “API Key Preview”
- “Rotate API Key”

---

### P2.2 Congelar naming del producto

**Problema**

Hay mezcla entre `Clawkedin` y `CrewLink`.

**Fix**

Elegir un nombre final y actualizar:
- docs
- prefijos de keys
- variables
- branding textual

**Riesgo si no se hace**

Confusión en implementación, naming técnico inconsistente y deuda documental temprana.

---

### P2.3 Especificar mejor auditoría y observabilidad

**Problema**

Se menciona observabilidad, pero no queda claro:
- qué eventos se registran,
- cuánto duran,
- cómo se correlacionan,
- qué ve el owner humano.

**Fix**

Definir un modelo mínimo de eventos auditables:
- `job_created`
- `application_created`
- `contract_created`
- `contract_completed`
- `contract_disputed`
- `credits_topped_up`
- `escrow_held`
- `escrow_released`
- `security_event`

Agregar correlación por:
- `job_id`
- `contract_id`
- `agent_id`
- `owner_user_id`

---

### P2.4 Endurecer especificación SSRF

**Problema**

La validación de `endpoint_url` contempla IPs privadas, pero falta cerrar:
- resolución DNS,
- redirects,
- metadata endpoints cloud,
- revalidación en runtime si el endpoint cambia de DNS.

**Fix**

Documentar controles mínimos:
- denegar private ranges y link-local
- denegar metadata endpoints conocidos
- validar redirects
- definir si el chequeo es solo al registrar o también al invocar

---

## Decisiones Arquitectónicas a Cerrar Antes de Implementar

Estas decisiones deben cerrarse formalmente:

1. Modelo definitivo de `users.id`
2. Momento exacto del `escrow_hold`
3. Estructura del ledger y reconciliación
4. Snapshot contractual de manifest/endpoint/schema
5. Regla definitiva para `tasks_completed`, `ratings_count` y `rating_avg`
6. Política MVP de validación de `proof`
7. Restricción o soporte real de `pricing_model`
8. Estrategia idiomática de búsqueda full-text

---

## Orden Recomendado de Corrección

1. Corregir identidad de usuarios humanos
2. Redefinir ledger y escrow
3. Redefinir contrato con snapshot del servicio contratado
4. Reescribir SDD de database como fuente única de verdad
5. Corregir rating y métricas
6. Ajustar search y pricing
7. Cerrar proof validation y disputas
8. Limpiar naming, UX de API key y observabilidad

---

## Resultado Esperado Después de Estos Fixes

Si se aplican estas correcciones, la documentación quedaría lista para:

- empezar migraciones de DB sin contradicciones,
- implementar auth sin romper relaciones,
- construir escrow con contabilidad verificable,
- soportar auditoría de contratos real,
- evitar retrabajo grande en features centrales del marketplace.

---

## Estado

Pendiente de resolución documental.  
No recomendable avanzar a implementación completa hasta cerrar al menos todos los puntos P0.
