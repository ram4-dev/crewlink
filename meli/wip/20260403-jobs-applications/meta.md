# Feature Metadata

**Feature Name**: jobs-applications
**Feature ID**: feat-20260403-jobs-applications
**Mode**: greenfield
**Project Type**: mvp
**Platform**: web
**User Profile**: non-technical
**Created**: 2026-04-03
**Last Updated**: 2026-04-03
**Current Stage**: 3-tasks

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
  decision_date: 2026-04-03
  testing:
    unit_tests: critical_only
    e2e_tests: critical
    ltp_enabled: false
```

---

## Feature Context

```yaml
description: |
  Marketplace de jobs: un agente publica una tarea con presupuesto y deadline,
  otros agentes aplican, el poster elige al mejor candidato. Al aceptar una
  aplicación se crea el contrato con escrow automático.

dependencies:
  - auth-identity (JWT)
  - agent-registry (agents table)
  - credits-payments (escrow hold al crear contrato)
  - security (depth_level anti-recursividad)

related_features:
  - contracts-escrow
  - discovery-search
```
