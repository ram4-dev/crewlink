# Deployment Remediation Plan

## Uso de este documento

Este archivo esta pensado como fuente para que Claude derive specs tecnicas.

Regla de uso:

- Cada bloque de abajo debe tratarse como una spec independiente
- Claude no debe fusionar bloques salvo que el acoplamiento tecnico sea explicito
- Si una spec requiere migraciones, cambios de API y cambios de app, debe documentarlos todos dentro del mismo bloque

## Definicion de listo global

El sistema queda apto para despliegue cuando:

- No existe ningun bypass de auth ni endpoints de seed fuera de local
- Las variables criticas fallan al arranque si faltan
- Los flujos sensibles de dinero y cambio de estado son atomicos
- El build es reproducible sin dependencia fragil de recursos externos
- Hay headers de seguridad web minimos
- El pipeline CI bloquea merges si falla build o tests criticos
- Hay trazabilidad minima de eventos de seguridad y operacion

## Prioridad P0

### Spec P0-01: Politica estricta de entornos y bloqueo de bypasses

Contexto:

- Hoy existe `DEV_NO_AUTH` como bypass global
- La politica actual depende de `NODE_ENV` y esta repartida entre middleware y session auth

Problema actual:

- Un deploy mal configurado puede quedar sin auth real
- La politica no esta centralizada

Riesgo si no se corrige:

- Exposicion total del dashboard y rutas protegidas
- Inconsistencia entre capas de auth

Objetivo:

- Permitir bypasses solo en local explicito y nunca en staging/production

Alcance:

- Politica de entorno
- Middleware
- Session auth
- Validaciones de arranque

No alcance:

- Cambio de proveedor de auth

Diseno propuesto:

- Introducir `APP_ENV` con valores `local`, `staging`, `production`
- Prohibir `DEV_NO_AUTH=true` cuando `APP_ENV != local`
- Hacer fail-fast al arranque si esa combinacion ocurre
- Centralizar la logica en un modulo de config comun

Archivos afectados:

- [src/middleware.ts](/Users/rcarnicer/Desktop/crewlink/src/middleware.ts)
- [src/lib/auth/session-auth.ts](/Users/rcarnicer/Desktop/crewlink/src/lib/auth/session-auth.ts)
- [`.env.example`](/Users/rcarnicer/Desktop/crewlink/.env.example)
- nuevo `src/lib/config.ts`

Cambios en API contract:

- Ninguno

Variables de entorno involucradas:

- nueva `APP_ENV`
- `DEV_NO_AUTH`

Criterios de aceptacion:

- Si `APP_ENV=staging` o `APP_ENV=production` y `DEV_NO_AUTH=true`, la app falla al arrancar
- Si `APP_ENV=local`, el bypass puede seguir usandose
- Middleware y session auth usan la misma fuente de verdad

Casos de prueba:

- Arranque exitoso con `APP_ENV=local` y `DEV_NO_AUTH=true`
- Arranque fallido con `APP_ENV=staging` y `DEV_NO_AUTH=true`
- Arranque fallido con `APP_ENV=production` y `DEV_NO_AUTH=true`

Riesgos de migracion:

- Ambientes existentes sin `APP_ENV` definido

Plan de rollout:

1. Introducir `APP_ENV` con default seguro
2. Actualizar entornos de deploy
3. Activar fail-fast

Plan de rollback:

- Revertir el uso de `APP_ENV` manteniendo la validacion previa

### Spec P0-02: Eliminacion o blindaje total del endpoint demo seed

Contexto:

- Existe `/api/demo/seed`
- Solo se bloquea en `NODE_ENV=production`

Problema actual:

- El endpoint puede quedar accesible en preview o staging
- Devuelve API key valida con credito inicial

Riesgo si no se corrige:

- Creacion de usuarios demo con credenciales reales
- Abuso directo de la plataforma

Objetivo:

- Asegurar que el endpoint no exista o sea inaccesible fuera de local

Alcance:

- Ruta demo seed
- Politica de bootstrap dev

No alcance:

- Herramientas locales de seed por CLI

Diseno propuesto:

- Opcion recomendada: eliminar la ruta del arbol runtime y mover seed a script local
- Opcion alternativa: exigir `APP_ENV=local` y un secreto de bootstrap separado

Archivos afectados:

- [src/app/api/demo/seed/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/demo/seed/route.ts)
- posible nuevo `scripts/seed-demo.ts`
- [`.env.example`](/Users/rcarnicer/Desktop/crewlink/.env.example)

Cambios en API contract:

- La ruta puede desaparecer

Variables de entorno involucradas:

- `APP_ENV`
- opcional `DEMO_SEED_SECRET`

Criterios de aceptacion:

- En staging y production la ruta no existe o devuelve 404
- En local el seed sigue disponible por ruta protegida o por script

Casos de prueba:

- Request a `/api/demo/seed` en local
- Request a `/api/demo/seed` en staging
- Request a `/api/demo/seed` en production

Riesgos de migracion:

- Dependencia de demos internas sobre ese endpoint

Plan de rollout:

1. Identificar consumidores del endpoint
2. Migrar a script local si aplica
3. Remover o bloquear la ruta

Plan de rollback:

- Rehabilitar temporalmente la ruta solo bajo `APP_ENV=local`

### Spec P0-03: Configuracion centralizada y validada al arranque

Contexto:

- Las variables de entorno se leen directo desde muchos modulos
- El ejemplo de env no refleja el uso real

Problema actual:

- Hay defaults silenciosos en produccion
- Falta documentacion exacta de variables criticas

Riesgo si no se corrige:

- Deploys inconsistentes
- Features activadas o desactivadas por accidente
- Fallos tardios en runtime

Objetivo:

- Tener un contrato de configuracion unico, tipado y validado

Alcance:

- Variables de entorno de auth
- Stripe
- Supabase
- limits
- feature flags
- fees

No alcance:

- Secret management del proveedor de infraestructura

Diseno propuesto:

- Crear `src/lib/config.ts`
- Validar con Zod todas las variables requeridas
- Reemplazar lecturas directas de `process.env` por imports del modulo
- Mantener compatibilidad temporal con variables deprecadas solo si se documenta

Archivos afectados:

- nuevo `src/lib/config.ts`
- [`.env.example`](/Users/rcarnicer/Desktop/crewlink/.env.example)
- multiples archivos que hoy leen `process.env`

Cambios en API contract:

- Ninguno

Variables de entorno involucradas:

- `APP_ENV`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `JWT_SECRET`
- `JWT_EXPIRY_SECONDS`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CREDITS_PER_USD`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RATE_LIMIT_API_PER_MINUTE`
- `RATE_LIMIT_AUTH_PER_MINUTE`
- `AUTH_LOCKOUT_ATTEMPTS`
- `AUTH_LOCKOUT_DURATION_SECONDS`
- `PLATFORM_FEE_TIER_1`
- `PLATFORM_FEE_TIER_2`
- `PLATFORM_FEE_TIER_3`
- `MAX_AGENT_CHAIN_DEPTH`
- `FEATURE_FLAG_SEMANTIC_SEARCH`
- `OPENAI_API_KEY`

Criterios de aceptacion:

- Si falta una variable critica, la app falla al arrancar con mensaje claro
- `.env.example` contiene todas las variables de runtime
- No quedan lecturas directas de `process.env` salvo casos justificados

Casos de prueba:

- Boot con config valida
- Boot con `JWT_SECRET` faltante
- Boot con `UPSTASH_*` faltantes en production
- Boot con `OPENAI_API_KEY` faltante y semantic search activado

Riesgos de migracion:

- Codigo existente que importe envs antes del parser central

Plan de rollout:

1. Crear parser central
2. Migrar modulos de a grupos
3. Activar validacion dura en CI y runtime

Plan de rollback:

- Mantener capa de compatibilidad temporal hacia `process.env`

### Spec P0-04: Rate limiting distribuido obligatorio en produccion

Contexto:

- El limitador actual degrada a memoria local si falta Upstash

Problema actual:

- En multiples instancias el rate limiting deja de ser confiable

Riesgo si no se corrige:

- Brute force de auth agent
- Abuso de endpoints publicos y privados

Objetivo:

- Forzar rate limiting distribuido en cualquier entorno desplegado

Alcance:

- libreria de rate limit
- endpoints criticos
- config

No alcance:

- WAF externo

Diseno propuesto:

- En `production`, fallar al arranque si faltan `UPSTASH_*`
- Permitir fallback en memoria solo en `local`
- Ampliar cobertura a endpoints de registro, rotacion de API key y topup
- Definir por endpoint el identificador correcto de limit

Archivos afectados:

- [src/lib/security/rate-limit.ts](/Users/rcarnicer/Desktop/crewlink/src/lib/security/rate-limit.ts)
- [src/app/api/auth/agent/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/auth/agent/route.ts)
- [src/app/api/agents/register/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/agents/register/route.ts)
- [src/app/api/dashboard/api-key/rotate/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/dashboard/api-key/rotate/route.ts)
- [src/app/api/dashboard/credits/topup/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/dashboard/credits/topup/route.ts)

Cambios en API contract:

- Posibles nuevas respuestas `429`

Variables de entorno involucradas:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `RATE_LIMIT_API_PER_MINUTE`
- `RATE_LIMIT_AUTH_PER_MINUTE`

Criterios de aceptacion:

- Production no arranca sin `UPSTASH_*`
- Los endpoints criticos devuelven `429` consistentemente al exceder limites
- Los limites quedan documentados

Casos de prueba:

- Rate limit auth por `agent_id`
- Rate limit dashboard por `userId`
- Registro antes de auth usando IP o equivalente

Riesgos de migracion:

- Ruptura en entornos que hoy dependen del fallback

Plan de rollout:

1. Agregar configuracion y tests
2. Configurar Upstash en todos los entornos de deploy
3. Activar fail-fast

Plan de rollback:

- Volver temporalmente a modo warning mientras se corrige infraestructura

### Spec P0-05: Sanitizacion de errores internos y logging seguro

Contexto:

- Algunos handlers devuelven `err.message` al cliente

Problema actual:

- Se exponen mensajes internos de RPC, DB o servicios externos

Riesgo si no se corrige:

- Filtracion de detalles internos
- Mayor superficie para enumeracion y abuso

Objetivo:

- Separar mensaje interno de mensaje publico

Alcance:

- capa de errores API
- endpoints con 500s
- logging

No alcance:

- observabilidad completa

Diseno propuesto:

- Crear helper comun para loggear error interno y responder mensaje publico fijo
- Estandarizar respuesta con `code`, `error` y opcional `request_id`
- Prohibir concatenar mensajes internos en respuestas 500

Archivos afectados:

- [src/lib/errors.ts](/Users/rcarnicer/Desktop/crewlink/src/lib/errors.ts)
- [src/app/api/contracts/[id]/complete/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/contracts/[id]/complete/route.ts)
- otros endpoints que hagan passthrough de `err.message`

Cambios en API contract:

- Respuestas 500 mas genericas y uniformes

Variables de entorno involucradas:

- ninguna obligatoria

Criterios de aceptacion:

- Ninguna respuesta 500 incluye mensajes internos crudos
- Los logs internos retienen contexto suficiente

Casos de prueba:

- Falla forzada en settlement
- Falla forzada en DB update
- Verificacion de payload publico del error

Riesgos de migracion:

- Menor detalle visible para debugging manual

Plan de rollout:

1. Introducir helper
2. Migrar endpoints sensibles
3. Revisar snapshots/tests

Plan de rollback:

- Revertir helper manteniendo sanitizacion puntual en endpoints mas criticos

## Prioridad P1

### Spec P1-01: Aprobacion de contratos via RPC atomico

Contexto:

- Aprobar un contrato hoy hace updates separados sobre `contracts` y `jobs`

Problema actual:

- Puede quedar estado parcial si una operacion falla

Riesgo si no se corrige:

- Contrato activo con job inconsistente
- Bugs de negocio y soporte dificil

Objetivo:

- Garantizar consistencia atomica en la aprobacion humana

Alcance:

- migracion SQL
- RPC
- endpoint approve

No alcance:

- rechazo, salvo que se considere parte de la misma familia y se quiera alinear

Diseno propuesto:

- Crear RPC `approve_pending_contract(p_contract_id UUID, p_user_id UUID)`
- El RPC debe:
- lockear el contrato
- validar `status = pending_approval`
- validar ownership del hiring agent
- actualizar contrato a `active`
- actualizar job a `in_progress`
- soportar idempotencia o error controlado

Archivos afectados:

- nueva migracion en `supabase/migrations`
- [src/app/api/dashboard/contracts/[id]/approve/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/dashboard/contracts/[id]/approve/route.ts)
- [src/lib/credits/escrow.ts](/Users/rcarnicer/Desktop/crewlink/src/lib/credits/escrow.ts) o helper equivalente

Cambios en DB/migrations/RPCs:

- nueva RPC transaccional

Cambios en API contract:

- ninguno o mensajes de error mas precisos

Variables de entorno involucradas:

- ninguna nueva

Criterios de aceptacion:

- No existe estado parcial si falla la aprobacion
- Las aprobaciones concurrentes no rompen consistencia
- Ownership y estado se validan dentro de la transaccion

Casos de prueba:

- Approve exitoso
- Approve por owner invalido
- Approve sobre contrato ya activo
- Approve concurrente doble

Riesgos de migracion:

- Necesidad de mapear nuevos errores SQL a errores API

Plan de rollout:

1. Agregar migracion
2. Publicar endpoint actualizado
3. Correr regression tests

Plan de rollback:

- Volver temporalmente al flujo anterior si la RPC fallara

### Spec P1-02: Inventario de flujos multi-write y decision de atomicidad

Contexto:

- No todos los flujos sensibles usan RPC

Problema actual:

- Hay side effects distribuidos que pueden quedar a mitad de camino

Riesgo si no se corrige:

- Inconsistencia de negocio
- Duplicidad o perdida de updates

Objetivo:

- Revisar y clasificar cada flujo sensible

Alcance:

- rating
- dispute
- rotate api key
- stripe customer linkage

No alcance:

- refactor general de todos los endpoints

Diseno propuesto:

- Armar una tabla de decision por flujo:
- nombre
- writes involucrados
- necesita atomicidad si/no
- justificacion
- accion propuesta

Archivos afectados:

- [src/app/api/contracts/[id]/rate/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/contracts/[id]/rate/route.ts)
- [src/app/api/contracts/[id]/dispute/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/contracts/[id]/dispute/route.ts)
- [src/app/api/dashboard/api-key/rotate/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/dashboard/api-key/rotate/route.ts)
- [src/app/api/dashboard/credits/topup/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/dashboard/credits/topup/route.ts)

Cambios en API contract:

- Depende del flujo

Variables de entorno involucradas:

- ninguna nueva

Criterios de aceptacion:

- Cada flujo multi-write tiene decision explicita
- Los que requieran atomicidad quedan asignados a nueva spec o implementados

Casos de prueba:

- No aplica como unica salida; sirve como documento de decision

Riesgos de migracion:

- Expandir demasiado el alcance

Plan de rollout:

1. Inventariar
2. Clasificar
3. Ejecutar solo los cambios aprobados

Plan de rollback:

- No aplica, salvo revertir cambios derivados

### Spec P1-03: Headers HTTP de seguridad y politica CSP

Contexto:

- No hay hardening HTTP global en Next

Problema actual:

- Faltan headers base de seguridad

Riesgo si no se corrige:

- Menor baseline defensivo para browser security

Objetivo:

- Definir e implementar un baseline de seguridad HTTP

Alcance:

- `next.config.ts`
- CSP
- rutas sensibles

No alcance:

- WAF/CDN

Diseno propuesto:

- Agregar `headers()` en Next
- Incluir como minimo:
- `Strict-Transport-Security`
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `Permissions-Policy`
- `Content-Security-Policy`
- Revisar `Cache-Control: no-store` en rutas sensibles

Archivos afectados:

- [next.config.ts](/Users/rcarnicer/Desktop/crewlink/next.config.ts)

Cambios en API contract:

- headers adicionales

Variables de entorno involucradas:

- ninguna obligatoria

Criterios de aceptacion:

- Los headers aparecen en respuestas esperadas
- La CSP no rompe Clerk ni Stripe

Casos de prueba:

- Verificacion manual con `curl -I`
- Smoke test de sign-in
- Smoke test de topup Stripe

Riesgos de migracion:

- CSP demasiado estricta rompiendo integraciones

Plan de rollout:

1. Aplicar headers no controversiales
2. Introducir CSP en modo validado
3. Ajustar allowlists

Plan de rollback:

- Aflojar CSP manteniendo el resto de headers

### Spec P1-04: Build reproducible sin dependencia de Google Fonts externa

Contexto:

- El build actual depende de `fonts.googleapis.com`

Problema actual:

- El artefacto no es completamente reproducible

Riesgo si no se corrige:

- Fallos de build por red externa o restricciones del entorno

Objetivo:

- Eliminar la dependencia fragil de fuentes externas en build

Alcance:

- fuentes tipograficas
- Material Symbols

No alcance:

- rediseño visual amplio

Diseno propuesto:

- Opcion recomendada:
- mover fuentes a local con `next/font/local`
- reemplazar `Material Symbols` externos por assets locales o iconos alternativos

Archivos afectados:

- [src/app/layout.tsx](/Users/rcarnicer/Desktop/crewlink/src/app/layout.tsx)
- posibles assets locales en `public/` o carpeta de fonts

Cambios en API contract:

- ninguno

Variables de entorno involucradas:

- ninguna

Criterios de aceptacion:

- `npm run build` funciona sin resolver `fonts.googleapis.com`
- La UI mantiene consistencia visual aceptable

Casos de prueba:

- Build en entorno sin salida a internet
- Smoke visual basico

Riesgos de migracion:

- Diferencias visuales leves

Plan de rollout:

1. Incorporar fuentes locales
2. Ajustar layout
3. Validar build

Plan de rollback:

- Volver temporalmente a fuentes del sistema

### Spec P1-05: Matriz formal de autorizacion por endpoint

Contexto:

- El backend usa `service_role` en muchas rutas

Problema actual:

- La autorizacion depende mucho de checks manuales distribuidos

Riesgo si no se corrige:

- Nuevos endpoints pueden quedar expuestos por omision

Objetivo:

- Tener una matriz explicita de permisos y revisar rutas publicas

Alcance:

- inventario de endpoints
- clasificacion por actor
- decision de public/private

No alcance:

- reescritura total a RLS-first

Diseno propuesto:

- Tabla por endpoint con:
- metodo
- ruta
- actor permitido
- guard esperado
- recurso protegido
- notas
- Revisar especialmente si `dashboard/activity` debe ser publico

Archivos afectados:

- [src/app/api/dashboard/activity/route.ts](/Users/rcarnicer/Desktop/crewlink/src/app/api/dashboard/activity/route.ts)
- [src/middleware.ts](/Users/rcarnicer/Desktop/crewlink/src/middleware.ts)
- endpoints API bajo `src/app/api/**`

Cambios en API contract:

- algunos endpoints pueden pasar de publicos a autenticados

Variables de entorno involucradas:

- ninguna nueva

Criterios de aceptacion:

- Existe matriz de autorizacion completa
- Cada endpoint sensible tiene guard explicito
- No quedan endpoints publicos por accidente

Casos de prueba:

- Relevamiento documental
- Smoke tests por categoria de auth

Riesgos de migracion:

- Cambios de acceso que impacten clientes existentes

Plan de rollout:

1. Relevar endpoints
2. Aprobar decisiones de acceso
3. Implementar ajustes

Plan de rollback:

- Revertir solo cambios de acceso conflictivos manteniendo la matriz documentada

## Prioridad P2

### Spec P2-01: Validacion Zod por endpoint y unificacion de errores de input

Contexto:

- Muchos handlers validan a mano

Problema actual:

- Validaciones inconsistentes y poco reutilizables

Riesgo si no se corrige:

- Comportamientos desparejos
- Mayor probabilidad de edge cases no cubiertos

Objetivo:

- Estandarizar validacion de requests

Alcance:

- endpoints criticos de auth, jobs, contracts, dashboard

No alcance:

- validacion de todos los componentes frontend

Diseno propuesto:

- Crear schemas Zod por endpoint
- Reemplazar casts amplios y checks manuales por parsing centralizado
- Estandarizar `VALIDATION_ERROR`

Archivos afectados:

- endpoints bajo `src/app/api/**`
- posible helper compartido en `src/lib/validation.ts`

Cambios en API contract:

- respuestas de validacion mas uniformes

Variables de entorno involucradas:

- ninguna nueva

Criterios de aceptacion:

- Los endpoints criticos usan schemas Zod
- Los errores de validacion son consistentes

Casos de prueba:

- payloads invalidos por endpoint
- limites de longitud
- tipos numericos incorrectos

Riesgos de migracion:

- Tests existentes con mensajes exactos pueden romperse

Plan de rollout:

1. Migrar endpoints P0/P1 primero
2. Extender al resto

Plan de rollback:

- Mantener helpers de validacion manual donde una migracion no cierre a tiempo

### Spec P2-02: CI/CD como gate real de despliegue

Contexto:

- Hoy no hay evidencia de gate completo de release

Problema actual:

- Build y e2e no estan integrados como bloqueo formal de merge

Riesgo si no se corrige:

- Se puede desplegar codigo con build roto o sin cobertura e2e real

Objetivo:

- Hacer que CI valide lo minimo necesario antes de merge/deploy

Alcance:

- GitHub Actions o equivalente
- build
- tests
- e2e

No alcance:

- despliegue automatico multientorno

Diseno propuesto:

- Pipeline minimo con:
- install
- lint
- unit/integration
- build
- e2e levantando la app automaticamente
- opcional schema/migration checks

Archivos afectados:

- `.github/workflows/*`
- `package.json`
- configuracion de tests e2e

Cambios en API contract:

- ninguno

Variables de entorno involucradas:

- variables de test/CI segun entorno

Criterios de aceptacion:

- Un PR no mergea si falla build o tests criticos
- E2E no dependen de arrancar un server manualmente

Casos de prueba:

- Ejecucion completa en CI
- Build fallido bloquea
- E2E fallido bloquea

Riesgos de migracion:

- Mayor tiempo de pipeline

Plan de rollout:

1. Agregar pipeline basico
2. Hacerlo requerido para merge
3. Afinar performance

Plan de rollback:

- Desmarcar temporalmente como required check

### Spec P2-03: Observabilidad minima y auditoria de eventos sensibles

Contexto:

- Existen logs sueltos, sin estrategia uniforme

Problema actual:

- Falta trazabilidad consistente de eventos sensibles

Riesgo si no se corrige:

- Investigacion lenta de incidentes
- Dificultad para auditar abuso y fallos

Objetivo:

- Definir baseline de logging estructurado y eventos auditables

Alcance:

- auth
- rate limiting
- topup
- contratos
- API key rotation

No alcance:

- plataforma completa de observabilidad avanzada

Diseno propuesto:

- Logger estructurado con `request_id`
- Lista minima de eventos auditables:
- login de agente fallido
- lockout activado
- rotacion de API key
- creacion de agente
- aprobacion/rechazo de contrato
- topup Stripe procesado
- bloqueo por rate limit
- rechazo por SSRF
- Redaction estricta de secretos

Archivos afectados:

- posible nuevo `src/lib/logger.ts`
- endpoints sensibles

Cambios en API contract:

- opcional inclusion de `request_id` en errores

Variables de entorno involucradas:

- las del proveedor de logs si se integra uno

Criterios de aceptacion:

- Los eventos sensibles dejan traza consistente
- No se loggean secretos ni tokens completos

Casos de prueba:

- Verificacion de logs en eventos criticos
- Test de redaction

Riesgos de migracion:

- Ruido en logs si no se controla el volumen

Plan de rollout:

1. Introducir logger
2. Instrumentar eventos minimos
3. Ajustar niveles y redaction

Plan de rollback:

- Volver temporalmente a logging basico manteniendo redaction

## Orden de ejecucion recomendado

1. P0-01 Politica de entornos y bypasses
2. P0-02 Seed demo fuera de deploy
3. P0-03 Config central validada
4. P0-04 Rate limiting distribuido obligatorio
5. P0-05 Sanitizacion de errores internos
6. P1-01 RPC atomico de aprobacion
7. P1-02 Inventario de flujos multi-write
8. P1-03 Headers HTTP y CSP
9. P1-04 Build reproducible sin Google Fonts externas
10. P1-05 Matriz formal de autorizacion
11. P2-01 Validacion Zod por endpoint
12. P2-02 CI/CD como gate real
13. P2-03 Observabilidad minima

## Instruccion para Claude

Cuando derives una spec desde este archivo:

- Toma un solo bloque por vez
- No simplifiques criterios de aceptacion
- Si detectas dependencias, referencialas explicitamente
- Si una spec requiere migracion SQL, incluye:
- firma del RPC
- invariantes
- manejo de concurrencia
- mapeo de errores
- Si una spec cambia acceso o seguridad, incluye:
- matriz de actores
- casos negativos
- riesgo de regresion
