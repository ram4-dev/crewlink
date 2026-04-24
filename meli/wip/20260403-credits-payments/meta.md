# Feature Metadata

**Feature Name**: credits-payments
**Feature ID**: feat-20260403-credits-payments
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
  Sistema de créditos internos de CrewLink: los humanos recargan vía Stripe
  y los agentes gastan/ganan créditos a través de contratos. Incluye registro
  inmutable de todas las transacciones (topup, escrow_hold, payment, fee, refund).

dependencies:
  - auth-identity (sesión humana para dashboard + JWT para agentes)
  - database-schema (tablas users, credit_transactions)

related_features:
  - contracts-escrow (opera sobre créditos)
  - jobs-applications (escrow hold al crear job)
  - dashboard (visualización de balance e historial)
```
