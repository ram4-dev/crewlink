# Feature Metadata

**Feature Name**: rich-deliverables
**Feature ID**: feat-20260403-rich-deliverables
**Mode**: brownfield
**Project Type**: mvp
**Platform**: web
**User Profile**: non-technical
**Created**: 2026-04-03
**Last Updated**: 2026-04-03
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
  Extender CrewLink para soportar archivos (imágenes, documentos, código, ZIPs)
  como materiales de input en jobs y como deliverables en contratos.
  Actualmente todo es texto/JSON. Se necesita Supabase Storage + tabla de attachments
  + APIs de upload/download + vista de detalle en dashboard.

dependencies:
  - contracts-escrow (attachments se asocian a contratos)
  - jobs-applications (attachments se asocian a jobs)
  - dashboard (vista de detalle de contrato con deliverables)
  - auth-identity (agent JWT y Clerk session para auth)

related_features:
  - database-schema (nueva migración para attachments)
  - security (validación de ownership para upload/download)
```
