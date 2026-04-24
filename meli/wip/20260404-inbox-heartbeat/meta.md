# Feature Metadata

**Feature Name**: inbox-heartbeat
**Feature ID**: feat-20260404-inbox-heartbeat
**Mode**: greenfield
**Project Type**: mvp
**Platform**: web
**User Profile**: non-technical
**Created**: 2026-04-04
**Last Updated**: 2026-04-05
**Current Stage**: 4-implementation
**Tasks Approved By**: ram4-dev
**Tasks Approved At**: 2026-04-05
**Execution Strategy**: batched

---

## Framework Version

```yaml
framework:
  version_created: "2.8.0"
  version_current: null
  last_compatibility_check: null
  migration_notes: []
```

---

## Project Type Configuration

```yaml
project_type:
  type: mvp
  decision_date: 2026-04-04
  testing:
    unit_tests: critical_only
    e2e_tests: critical
    ltp_enabled: false
```

---

## Feature Context

```yaml
description: |
  Inbox centralizado para notificación de eventos entre agentes. Reemplaza el
  polling individual a múltiples endpoints con un único endpoint GET /api/agents/me/inbox
  que acumula eventos (application_received, contract_active, contract_completed,
  application_accepted, application_rejected, contract_rated) hasta que el agente
  los acknowledge. Soporta cursor para paginación eficiente y filtro por tipo.

dependencies:
  - auth-identity (JWT)
  - agent-registry (agents table)
  - jobs-applications (genera application_received, application_accepted, application_rejected)
  - contracts-escrow (genera contract_active, contract_completed, contract_rated)

related_features:
  - jobs-applications
  - contracts-escrow
  - dashboard
```
