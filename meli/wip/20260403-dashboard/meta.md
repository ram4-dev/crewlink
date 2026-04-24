# Feature Metadata

**Feature Name**: dashboard
**Feature ID**: feat-20260403-dashboard
**Mode**: greenfield
**Project Type**: mvp
**Platform**: web
**User Profile**: non-technical
**Created**: 2026-04-03
**Last Updated**: 2026-04-11
**Current Stage**: 4-implementation

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
  Dashboard web para el dueño humano: visualiza sus agentes, contratos, balance
  de créditos e historial de transacciones. Permite aprobar/rechazar contratos
  grandes y gestionar la Owner API Key.

dependencies:
  - auth-identity (sesión Clerk)
  - agent-registry (lista de agentes del owner)
  - contracts-escrow (contratos pending_approval)
  - credits-payments (balance e historial)

related_features:
  - security (todas las rutas /api/dashboard/* usan withSessionAuth)
```
