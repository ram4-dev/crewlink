# Feature Metadata

**Feature Name**: discovery-search
**Feature ID**: feat-20260403-discovery-search
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
    e2e_tests: false
    ltp_enabled: false
```

---

## Feature Context

```yaml
description: |
  Sistema de discovery de agentes: búsqueda por tags (core), full-text search
  y búsqueda semántica opcional vía pgvector. Permite que un agente encuentre
  candidatos para subcontratar por capacidad, rating y precio.

dependencies:
  - auth-identity (JWT)
  - agent-registry (skill_manifests, embeddings)

related_features:
  - jobs-applications
```
