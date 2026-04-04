# Spec de Remediación 04

## Quality Gates

Fecha: 2026-04-03
Prioridad: P1
Ámbito: repo completo

---

## Problema

El proyecto declara quality gates exigentes, pero hoy no son verificables en práctica:

- la suite no corre en un checkout limpio sin instalar dependencias;
- faltan dependencias declaradas para código ya importado;
- la cobertura real no cubre paths críticos;
- no hay gates mínimos de integración para flujos financieros y de seguridad.

---

## Decisiones

### D1. Los quality gates del proyecto deben ser ejecutables localmente

No alcanza con declarar:

- `code_review: mandatory`
- `security_review_for: auth/payments/escrow`
- `coverage >= 70`

Debe existir un set mínimo de comandos y dependencias que permita verificarlo en un entorno limpio.

### D2. Los paths críticos mandan la cobertura

La prioridad de test no es repartir coverage uniforme, sino asegurar:

- auth humana y de agentes;
- onboarding y rotación de API keys;
- Stripe webhook idempotente;
- escrow y settlement;
- search público/privado;
- dashboard de contratos sensibles.

### D3. Buildability es parte del gate

Si el código importa una librería, debe estar declarada.

Si un endpoint crítico depende de una lib ausente, el gate falla aunque los tests no lleguen a correr.

---

## Gates obligatorios

### G1. Dependencias y scripts

El repo debe poder ejecutar, en un checkout limpio:

1. `npm install`
2. `npm test`
3. `npm run build`

Queda obligatorio:

- declarar `svix` si se usa en webhook Clerk;
- mantener `.env.example` sincronizado con env vars canónicas;
- documentar env mínimas para correr tests.

### G2. Cobertura mínima por dominio

No se exige solo coverage global. Se exige cobertura funcional mínima en:

- `auth`
- `payments`
- `escrow`
- `search`
- `dashboard contracts`

Mínimos recomendados:

- unit para helpers puros;
- integration para handlers con DB/RPC/mock de servicios externos;
- e2e o smoke tests para onboarding y dashboard protegido.

### G3. Casos obligatorios

La suite debe cubrir, como mínimo:

- webhook Stripe duplicado concurrente no duplica créditos;
- `hire` con diff positivo concurrente no rompe saldo;
- `complete` no paga si el contrato no quedó `completed`;
- `reject` no devuelve escrow si el contrato no quedó `cancelled`;
- register bloquea SSRF;
- onboarding no filtra API key a otro usuario;
- search `total` y ranking son estables;
- dashboard contracts ordena `pending_approval` primero.

### G4. Gating de drift de specs

Toda PR que toque:

- auth,
- payments,
- escrow,
- search,
- dashboard contracts

debe actualizar tests y specs si cambia contrato observable.

No se admite cambiar comportamiento observable sin una de estas dos cosas:

1. actualizar spec;
2. demostrar que el comportamiento previo ya violaba spec y dejar constancia en la PR.

---

## Entregables requeridos

Este paquete de remediación se considera completo solo si deja:

- suite corriendo con dependencias declaradas;
- tests nuevos para todos los paths críticos marcados arriba;
- `README` o sección equivalente con comandos de verificación;
- actualización de specs activas impactadas.

---

## Definition of Done

- `npm test` corre en un entorno limpio con dependencias instaladas;
- `npm run build` no falla por imports faltantes;
- existe cobertura de integración sobre auth/pagos/escrow;
- existe cobertura de search/dashboard para contratos de respuesta;
- los quality gates del proyecto dejan de ser aspiracionales y pasan a ser chequeables.
