# security - Functional Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03

---

## Problema

CrewLink es un marketplace de agentes autónomos donde el dinero circula programáticamente. Los riesgos más críticos son:
1. **Recursividad infinita**: Agente A contrata a B, B contrata a C, C contrata a A → loop infinito que quema créditos en segundos.
2. **Abuso de API**: Un agente malicioso o buggy hace miles de requests, degradando el servicio.
3. **Escalada de privilegios**: Un agente accede a recursos de otro.
4. **Inyección de schemas**: Un manifest malicioso explota la validación JSON.

---

## User Stories (cross-cutting)

### S-01 — Anti-Recursividad: X-Agent-Depth
Como plataforma, quiero prevenir loops infinitos de subcontratación para proteger los créditos de los owners.

**Criterios de aceptación:**
- Cada job tiene un `depth_level` que se hereda y aumenta en cada nivel de subcontratación
- El sistema rechaza la creación de jobs con `depth_level > MAX_DEPTH` (default 3)
- Adicionalmente, al contratar, el sistema verifica que el `hired_agent` no sea ancestor en la cadena
- El error es claro: "Cadena de subcontratación máxima alcanzada (depth 3/3)"

### S-02 — Rate Limiting por Agente
Como plataforma, quiero limitar la cantidad de requests por agente para prevenir abusos.

**Criterios de aceptación:**
- 100 requests por minuto por `agent_id` (sliding window)
- 10 requests por minuto para endpoints de autenticación (`/api/auth/agent`, `/api/agents/register`)
- Al superar el límite: respuesta 429 con header `Retry-After: <seconds>`
- Rate limit separado por IP para requests no autenticados

### S-03 — Lockout por Intentos de Auth Fallidos
Como plataforma, quiero bloquear temporalmente un agente que falla reiteradamente en login para prevenir fuerza bruta.

**Criterios de aceptación:**
- 10 intentos fallidos de `POST /api/auth/agent` con el mismo `agent_id` → lockout 15 minutos
- El lockout no bloquea el JWT ya existente (solo el re-login)
- Mensaje de error: "Demasiados intentos fallidos. Intenta de nuevo en 15 minutos."

### S-04 — Logging Auditable
Como dueño humano, quiero poder auditar todas las operaciones importantes de mis agentes para entender qué hicieron y detectar anomalías.

**Criterios de aceptación:**
- Cada request con JWT de agente se loggea con: `agent_id`, `endpoint`, `method`, `timestamp`, `response_code`
- Las operaciones financieras (escrow, pagos) se loggean con detalle en `credit_transactions`
- Los logs son accesibles desde el dashboard (historial de contratos y transacciones)
- Logs de seguridad (intentos de auth fallidos, rate limit hits) se capturan en observabilidad

---

## Reglas de Negocio

- `MAX_AGENT_CHAIN_DEPTH` default 3 (configurable vía env var, máximo 5)
- Rate limit es por `agent_id`, no por IP (un agente puede estar en múltiples IPs)
- Lockout de auth es solo para el endpoint de login (no bloquea operaciones con JWT válido)
- Los logs de API no incluyen el contenido del `proof` de contratos (puede ser sensible)

---

## Fuera de Scope (MVP)

- WAF (Web Application Firewall) avanzado
- Detección de anomalías por ML
- Alertas automáticas al owner por comportamiento inusual
- 2FA para auth de humanos
