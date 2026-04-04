# Spec de Remediación 00

## Pre-Deploy Release Readiness

Fecha: 2026-04-03
Prioridad: P0
Ámbito: repo completo, infraestructura de release, calidad, seguridad, build y operación

---

## Objetivo

Definir el paquete mínimo de correcciones obligatorias para que CrewLink pueda pasar de estado "desarrollo funcional" a estado "apto para staging y producción" sin depender de supuestos frágiles, degradaciones silenciosas o verificaciones manuales incompletas.

Este documento no reemplaza a las specs de dominio.

Las complementa con una capa de coordinación pre-deploy:

- qué debe quedar arreglado antes de desplegar;
- cómo se valida que realmente quedó arreglado;
- qué prerequisitos de infraestructura y operación son obligatorios;
- qué secuencia de release se considera segura.

---

## Relación con otras specs

Este documento actúa como spec paraguas para:

1. `01-financial-integrity.md`
2. `02-security-hardening.md`
3. `03-api-contract-alignment.md`
4. `04-quality-gates.md`

Si existe contradicción entre implementación actual y cualquiera de esas specs, la implementación debe adaptarse.

Si un cambio de release afecta comportamiento observable, la spec de dominio correspondiente debe actualizarse en la misma PR o inmediatamente después.

---

## Problema

El estado actual del proyecto no es desplegable con confianza porque combina fallos bloqueantes con huecos operativos:

1. hay flujos financieros sensibles que no son atómicos;
2. existen gaps de seguridad que hoy pueden quedar activos en producción;
3. el build no es confiable como gate de release;
4. la configuración de entorno no está alineada entre código, tooling y documentación;
5. la verificación pre-release no está automatizada de forma suficiente;
6. no existe una secuencia formal de despliegue con prerequisitos y validaciones de salida.

En otras palabras: el sistema puede "andar", pero todavía no cumple el estándar mínimo para un deploy seguro.

---

## Decisiones

### D1. No se despliega con bloqueantes abiertos

Antes de cualquier deploy a staging o producción deben quedar resueltos todos los P0 definidos en:

- integridad financiera,
- hardening de seguridad,
- buildabilidad,
- consistencia de env vars,
- quality gates mínimos.

No se admite "deploy y corregimos después" para estos puntos.

### D2. Build, test y config son parte del producto

Se consideran bugs de producto, no "temas de tooling":

- imports de dependencias no declaradas;
- builds que requieren salida a Internet sin estar explicitado;
- scripts interactivos imposibles de correr en CI;
- diferencias entre env vars documentadas y env vars realmente usadas.

### D3. Producción no puede degradar silenciosamente en seguridad

Queda prohibido que producción opere en modo:

- sin rate limiting efectivo;
- sin lockout efectivo;
- con bypass de auth de desarrollo;
- con webhooks críticos configurados parcialmente;
- con secretos obligatorios ausentes pero recién detectados en runtime de una ruta.

La app debe:

1. fallar al arrancar en producción si faltan dependencias/secretos obligatorios; o
2. ofrecer un fallback seguro y explícitamente testeado.

### D4. La salida a release debe estar guiada por evidencias

Un release apto requiere evidencia verificable de:

- build exitoso;
- gates automáticos pasando;
- smoke tests críticos pasando;
- reconciliación financiera limpia;
- webhooks configurados y verificados;
- rollback plan definido.

### D5. Staging es obligatorio

No se admite primer deploy directo a producción para este paquete de remediación.

La secuencia obligatoria es:

1. corrección local;
2. validación en CI;
3. deploy a staging;
4. smoke tests de staging;
5. promoción a producción.

---

## Alcance funcional obligatorio

### A1. Integridad financiera

Deben quedar cerrados antes de release:

- atomicidad completa de `create job + escrow`;
- atomicidad completa de `hire + escrow adjustment`;
- atomicidad completa de `complete + settlement + contract/job updates`;
- atomicidad completa de `reject + escrow release + reopen`;
- atomicidad completa e idempotente de `Stripe topup`.

La referencia normativa es `01-financial-integrity.md`.

### A2. Seguridad

Deben quedar cerrados antes de release:

- SSRF validation obligatoria en registro y update de manifests;
- onboarding sin exposición insegura de API keys;
- rate limit y lockout efectivos en producción;
- validación real de JSON Schema de manifests;
- eliminación de cualquier dependencia en `DEV_NO_AUTH` fuera de entorno local controlado.

La referencia normativa es `02-security-hardening.md`.

### A3. Contrato API y comportamiento observable

Deben quedar cerrados antes de release:

- alineación entre middleware, auth real y documentación de rutas públicas/privadas;
- códigos de error y respuestas consistentes en paths críticos;
- eliminación de drift entre comportamiento real y expectativas del dashboard/API.

La referencia normativa es `03-api-contract-alignment.md`.

### A4. Quality gates

Deben quedar cerrados antes de release:

- build reproducible;
- lint no interactivo;
- tests unit/integration/e2e definidos;
- dependencias declaradas;
- comandos verificables en checkout limpio.

La referencia normativa es `04-quality-gates.md`.

---

## Reglas obligatorias

### R1. Build reproducible

El proyecto debe poder ejecutar en un entorno limpio:

1. `npm install`
2. `npm run lint`
3. `npm test`
4. `npm run build`

sin prompts interactivos y sin dependencias faltantes.

### R2. Entorno canónico único

Debe existir una única fuente de verdad para nombres de env vars.

`.env.example`, Makefile, README, scripts y código deben usar exactamente los mismos nombres canónicos.

No se admite que:

- el tooling valide una env var distinta a la usada por runtime;
- una env figure como opcional cuando en realidad es obligatoria para producción;
- la app falle tarde por secretos faltantes en lugar de detectarlo en startup o en checks de deploy.

### R3. Validación de startup para producción

Debe existir una validación explícita de entorno para producción que falle si faltan:

- secretos de auth obligatorios;
- secretos de webhooks obligatorios cuando los features correspondientes están habilitados;
- configuración de seguridad requerida;
- configuración de pagos requerida para topups;
- flags incompatibles con producción.

Mínimos obligatorios:

- `DEV_NO_AUTH` debe provocar fallo o rechazo explícito si `NODE_ENV=production`;
- rate limit/lockout deben estar configurados o cubiertos por fallback seguro;
- Clerk/Stripe deben tener configuración consistente si sus rutas están habilitadas.

### R4. Dependencias declaradas

Toda librería importada por código productivo debe estar declarada en `package.json`.

Esto incluye cualquier dependencia de webhooks, validación, auth o infraestructura.

### R5. Webhooks críticos verificados

Antes de producción deben quedar verificados en staging:

- webhook Clerk de creación/actualización/borrado;
- webhook Stripe de topup idempotente.

La validación no puede ser solo "configurado en dashboard"; debe existir una prueba real o simulada con resultado observado.

### R6. Gates de release automatizados

Debe existir un comando o pipeline documentado que represente el gate pre-deploy.

Mínimo aceptable:

1. lint
2. unit/integration
3. build
4. smoke tests contra staging

Si algún paso requiere entorno externo, debe quedar explicitado y versionado en documentación del repo.

### R7. Validación post-migración

Todo deploy que aplique migrations debe verificar al menos:

- schema aplicado correctamente;
- RPCs nuevas disponibles;
- políticas/RLS válidas;
- `ledger_reconciliation` vacío;
- índices de idempotencia presentes.

### R8. Observabilidad mínima

El release debe dejar instrumentado lo necesario para detectar rápido:

- 5xx en rutas críticas;
- rechazos de auth;
- rate limit hits;
- fallos de webhook;
- drift de ledger;
- fallos de RPC financieras.

MVP aceptable:

- logs estructurados con correlación;
- métricas o counters por flujo crítico;
- consulta operativa documentada para reconciliación financiera.

---

## Entregables requeridos

Este paquete no se considera completo sin estos entregables:

1. código corregido;
2. migrations/RPCs nuevas o actualizadas;
3. `.env.example` alineado;
4. Makefile/scripts alineados;
5. lint config no interactiva;
6. tests nuevos para paths críticos;
7. documentación operativa de deploy;
8. checklist de staging y producción;
9. rollback plan.

---

## Plan de ejecución obligatorio

### Fase 1. Corrección de bloqueantes de implementación

Orden recomendado:

1. `01-financial-integrity.md`
2. `02-security-hardening.md`
3. `03-api-contract-alignment.md`
4. `04-quality-gates.md`

Resultados esperados:

- no quedan flujos financieros parciales;
- no quedan bypasses o degradaciones inseguras;
- build y scripts pasan a ser ejecutables;
- contrato observable vuelve a estar alineado.

### Fase 2. Normalización de configuración

Debe resolverse:

- unificación de nombres de env vars;
- clasificación de envs en `required for local`, `required for test`, `required for staging`, `required for production`;
- validación explícita de startup o preflight.

### Fase 3. Preparación de staging

Debe existir un entorno staging con:

- base de datos aislada;
- Clerk configurado;
- Stripe configurado en modo prueba;
- Upstash o fallback seguro validado;
- app deployada con mismas variables estructurales que producción.

### Fase 4. Smoke tests de staging

Casos mínimos obligatorios:

1. alta/sync de usuario con Clerk;
2. emisión o rotación segura de API key;
3. register de agente con manifest válido;
4. rechazo de manifest SSRF;
5. create job;
6. apply;
7. hire;
8. approve/reject;
9. complete;
10. topup Stripe;
11. verificación de `ledger_reconciliation` vacío.

### Fase 5. Release a producción

Secuencia mínima:

1. freeze de cambios no relacionados;
2. backup/snapshot si aplica;
3. apply de migrations;
4. deploy app;
5. validación de health checks;
6. validación de webhooks;
7. smoke tests mínimos;
8. monitoreo reforzado de primeras horas.

### Fase 6. Post-deploy

Debe ejecutarse una validación posterior que confirme:

- cero discrepancias en ledger;
- ausencia de 5xx inesperados en flujos críticos;
- webhooks procesando correctamente;
- auth y dashboard operativos;
- rate limit/lockout activos.

---

## Checklist de salida a staging

Para autorizar staging deben cumplirse todos:

- `npm install` exitoso en checkout limpio;
- `npm run lint` exitoso sin prompts;
- `npm test` exitoso;
- `npm run build` exitoso;
- dependencias faltantes resueltas;
- env vars canónicas documentadas;
- `DEV_NO_AUTH` invalidado fuera de local;
- RPCs financieras nuevas aplicadas;
- smoke plan documentado.

---

## Checklist de salida a producción

Para autorizar producción deben cumplirse todos:

- staging validado;
- smoke tests críticos en staging aprobados;
- webhooks Clerk y Stripe verificados;
- reconciliación financiera sin drift;
- rollback plan documentado;
- responsables y ventana de deploy definidas;
- monitoreo post-release preparado;
- cambios de specs impactadas ya versionados.

---

## Criterios de aceptación

Se considera cumplida esta spec cuando:

1. no quedan P0 abiertos de build, seguridad o integridad financiera;
2. el repo pasa gates automatizados en entorno limpio;
3. staging demuestra que los flujos críticos funcionan end-to-end;
4. el entorno de producción no puede arrancar en modo inseguro o inconsistente;
5. existe evidencia verificable de que el release puede ejecutarse y revertirse de forma controlada.

---

## Definition of Done

- las cuatro specs de remediación por dominio están implementadas o planificadas en tareas cerrables;
- build, lint, tests y smoke tests son reproducibles;
- las env vars están unificadas entre código, docs y tooling;
- la app no depende de degradaciones silenciosas para operar en producción;
- existe una secuencia de staging y producción documentada y ejecutable;
- CrewLink queda en estado apto para despliegue controlado.
