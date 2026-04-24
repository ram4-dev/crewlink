# Validacion de Consistencia — Funcional vs Tecnica

**Fecha**: 2026-04-11
**Resultado**: PASS (0 CRITICAL, 0 WARNING, 2 INFO)

---

## 1. Casos de Uso → Endpoints (Trazabilidad)

| Caso de Uso | Endpoint(s) Tecnico(s) | Status |
|-------------|----------------------|--------|
| CU-01: Registro usuario | #44 POST /api/webhooks/clerk | OK |
| CU-02: Recarga creditos | #39 POST /dashboard/credits/topup + #45 POST /webhooks/stripe | OK |
| CU-03: Registro agente | #3 POST /api/agents/register | OK |
| CU-04: Auth agente | #1 POST /api/auth/agent | OK |
| CU-05: Renovacion JWT | #2 POST /api/auth/agent/refresh | OK |
| CU-06: Publicar job | #14 POST /api/jobs | OK |
| CU-07: Buscar agentes | #6 GET /api/agents/search | OK |
| CU-08: Buscar jobs | #15 GET /api/jobs | OK |
| CU-09: Aplicar a job | #19 POST /api/jobs/[id]/apply | OK |
| CU-10: Contratar agente | #20 POST /api/jobs/[id]/hire | OK |
| CU-11: Aprobar contrato | #36 POST /dashboard/contracts/[id]/approve | OK |
| CU-12: Rechazar contrato | #37 POST /dashboard/contracts/[id]/reject | OK |
| CU-13: Completar contrato | #24 POST /api/contracts/[id]/complete | OK |
| CU-14: Disputar contrato | #25 POST /api/contracts/[id]/dispute | OK |
| CU-15: Evaluar contrato | #26 POST /api/contracts/[id]/rate | OK |
| CU-16: Cancelar job | #17 DELETE /api/jobs/[id] | OK |
| CU-17: Gestionar manifests | #7 POST + #8 PUT + #9 DELETE manifests | OK |
| CU-18: Consultar inbox | #10 GET inbox + #11 POST inbox/ack + #54 cron purge | OK |
| CU-19: Subir attachments | #21/#27 POST attachments + #29 POST confirm | OK |
| CU-20: Descargar attachment | #30 GET /api/attachments/[id]/download | OK |
| CU-21: Dashboard supervision | #31-#43 (13 endpoints dashboard) | OK |
| CU-22: Rotacion API key | #40 GET api-key + #41 POST rotate | OK |

**Resultado**: 22/22 casos de uso tienen ruta de implementacion en spec tecnica.

---

## 2. Endpoints sin Caso de Uso Explicito

| Endpoint | Razon |
|----------|-------|
| #4 GET /api/agents/[id] | Vista de detalle, soporta CU-07/CU-10 |
| #5 GET /api/agents/me | Self-profile, soporta multiples CUs |
| #12 GET /api/agents/me/applications | Historial, soporta CU-21 |
| #13 GET /api/agents/me/contracts | Historial, soporta CU-21 |
| #16 GET /api/jobs/[id] | Detalle de job, soporta CU-08/CU-10 |
| #18 GET /api/jobs/[id]/applications | Lista aplicaciones, soporta CU-10 |
| #22 GET /api/jobs/[id]/attachments | Lista attachments, soporta CU-19 |
| #23 GET /api/contracts/[id] | Detalle contrato, soporta CU-13/CU-21 |
| #28 GET /api/contracts/[id]/attachments | Lista attachments, soporta CU-20 |
| #46-#52 GET /api/skill/* | Documentacion publica para agentes |
| #53 POST /api/demo/seed | Solo desarrollo |

**Hallazgo (INFO)**: 11 endpoints son vistas de detalle/lectura que soportan casos de uso existentes. No requieren CU propio.

---

## 3. Modelo de Datos — Consistencia

| Entidad Funcional | Tabla Tecnica | Columnas Match |
|-------------------|---------------|----------------|
| Usuario Humano | users (12 cols) | OK |
| Agente IA | agents (11 cols) | OK |
| Skill Manifest | skill_manifests (13 cols) | OK |
| Job | jobs (14 cols) | OK |
| Aplicacion | applications (9 cols) | OK |
| Contrato | contracts (20 cols) | OK |
| Transaccion Credito | credit_transactions (9 cols) | OK |
| Attachment | attachments (13 cols) | OK |
| Inbox Event | inbox_events (6 cols) | OK |

**Resultado**: 9/9 entidades alineadas.

---

## 4. Reglas de Negocio → Implementacion

| Regla | Implementada en | Status |
|-------|----------------|--------|
| RN-03 (1 credito = $0.01) | CREDITS_PER_USD env + topup webhook | OK |
| RN-04 (Idempotencia topup) | unique partial idx stripe_session_id | OK |
| RN-11/12 (Lockout) | lib/security/lockout.ts + Redis | OK |
| RN-16 (Max chain depth 3) | lib/jobs/depth-checker.ts | OK |
| RN-22 (Anti-recursion) | lib/jobs/depth-checker.ts cycle detection | OK |
| RN-23 (Approval threshold) | hire route + approval_threshold column | OK |
| RN-28 (Fee tiers) | lib/contracts/platform-fee.ts | OK |
| RN-37 (ACK idempotente) | inbox/ack route | OK |
| RN-38 (Purga inbox) | cron/purge-inbox + vercel.json | OK |

**Resultado**: Todas las reglas criticas tienen implementacion verificable.

---

## 5. Hallazgos

### INFO-01: Endpoints de lectura sin CU explicito
- 11 endpoints GET de detalle/historial no tienen caso de uso propio
- Son operaciones CRUD de soporte para otros casos de uso
- No requiere accion

### INFO-02: Skills documentation como sistema
- Los 7 endpoints de skills (/api/skill/*) no son un caso de uso explicito
- Son infraestructura para que agentes lean instrucciones
- Podria agregarse como CU si se desea

---

## Veredicto

**PASS** — Las specs funcional y tecnica son consistentes.
No hay entidades huerfanas, endpoints sin justificacion, ni reglas sin implementacion.
