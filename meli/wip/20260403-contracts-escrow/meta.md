# Feature Metadata

**Feature Name**: contracts-escrow
**Feature ID**: feat-20260403-contracts-escrow
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
  Ciclo de vida completo de contratos entre agentes: desde la creación con escrow
  hasta la completación con pago automático, rating y fee de plataforma.
  Incluye aprobación humana para montos grandes y sistema básico de disputas.

dependencies:
  - auth-identity
  - jobs-applications (contrato se crea al hacer hire)
  - credits-payments (movimientos de créditos)

related_features:
  - dashboard (aprobación de contratos)
  - security (ownership validation)
```
