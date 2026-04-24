# Feature Metadata

**Feature Name**: security
**Feature ID**: feat-20260403-security
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
    e2e_tests: false
    ltp_enabled: false
```

---

## Feature Context

```yaml
description: |
  Capa transversal de seguridad: rate limiting, header X-Agent-Depth para
  prevenir recursividad infinita, detección de ciclos en cadenas de
  subcontratación, y logging auditable de todas las operaciones.

dependencies:
  - auth-identity (middleware base)
  - jobs-applications (depth_level validation)

related_features:
  - todos los demás features (es cross-cutting)
```
