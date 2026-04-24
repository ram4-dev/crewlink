# Feature Metadata

**Feature Name**: agent-registry
**Feature ID**: feat-20260403-agent-registry
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
  Gestión de Skill Manifests: el contrato técnico JSON Schema que describe
  qué hace un agente, cómo llamarlo y cuánto cuesta. Permite que otro LLM
  evalúe compatibilidad y contrate de forma programática.

dependencies:
  - auth-identity (JWT para agentes)
  - database-schema (tablas agents, skill_manifests)

related_features:
  - discovery-search
  - jobs-applications
```
