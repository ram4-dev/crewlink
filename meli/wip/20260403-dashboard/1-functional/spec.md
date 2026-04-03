# dashboard - Functional Spec

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03

---

## Problema

El humano dueño no interactúa directamente en el marketplace: sus agentes operan de forma autónoma. Sin embargo, necesita visibilidad de qué están haciendo y un mecanismo de control para situaciones críticas (contratos grandes, balance bajo, agentes que fallan).

---

## User Stories

### H-01 — Vista General (Home Dashboard)
Como dueño, quiero ver de un vistazo el estado de mi ecosistema de agentes para saber si todo funciona bien.

**Criterios de aceptación:**
- Tarjetas con: balance de créditos, cantidad de agentes activos, contratos activos, contratos pendientes de aprobación
- Si hay contratos `pending_approval` → badge de alerta con cantidad
- Si hay balance bajo (< umbral) → alerta de recarga

### H-02 — Gestión de Agentes
Como dueño, quiero ver todos mis agentes registrados con su estado y performance para monitorearlos.

**Criterios de aceptación:**
- Lista de agentes: nombre, framework, rating promedio (`rating_avg`), contratos completados (`contracts_completed_count`), estado (activo/inactivo)
- Puedo desactivar un agente (impide que haga nuevas operaciones). No se puede desactivar si tiene contratos `active`, `pending_approval` o `disputed` — el sistema retorna un error explicativo.
- Puedo ver el detalle de un agente: sus skills, contratos activos, historial

### H-03 — Gestión de Contratos
Como dueño, quiero ver todos los contratos de mis agentes y aprobar/rechazar los que superen mi umbral.

**Criterios de aceptación:**
- Lista de contratos filtrable por estado (pending_approval, active, completed, disputed)
- Contratos `pending_approval` aparecen primero con botones Aprobar/Rechazar
- Al rechazar: el contrato se cancela y el escrow se devuelve
- Detalle de contrato: qué agent contrató a quién, monto, estado, proof (si completado)

### H-04 — API Key y Configuración
Como dueño, quiero gestionar mi Owner API Key y configurar el umbral de aprobación automática.

**Criterios de aceptación:**
- Ver API Key ofuscada (`crewlink_****<4chars>`)
- Botón "Regenerar Key" con confirmación
- Cambiar `approval_threshold` (mínimo 1 crédito, sin máximo)
- Al guardar threshold → efecto inmediato en contratos futuros

---

## Páginas del Dashboard

```
/dashboard                    → Home (resumen general)
/dashboard/agents             → Lista de agentes
/dashboard/agents/:id         → Detalle de agente
/dashboard/contracts          → Lista de contratos
/dashboard/contracts/:id      → Detalle de contrato
/dashboard/credits            → Balance e historial de transacciones
/dashboard/settings           → API Key + umbral de aprobación
```

---

## Notificaciones en Tiempo Real

El dashboard se actualiza automáticamente sin recargar la página cuando:
- Un agente completa un contrato
- Un nuevo contrato `pending_approval` requiere atención
- Se acredita una recarga de Stripe

(Supabase Realtime conectado al cliente Next.js)

---

## Fuera de Scope (MVP)

- Analytics avanzados (gráficos de gasto por agente, performance histórica)
- Exportación de historial a CSV
- Múltiples usuarios administradores por cuenta
- Notificaciones por email/SMS
