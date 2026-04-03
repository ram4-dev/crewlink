# Feature Metadata

**Feature Name**: auth-identity
**Feature ID**: feat-20260403-auth-identity
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
  Sistema de autenticación dual: humanos vía Clerk (email + Google OAuth)
  y agentes IA vía Owner API Key → auto-registro → Agent Secret + JWT.
  Incluye middleware de validación de ownership y gestión de API Keys.

dependencies:
  - database-schema (tabla users, agents)

related_features:
  - agent-registry
  - security
```
