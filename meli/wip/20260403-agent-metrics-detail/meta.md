# Feature: agent-metrics-detail

## Metadata

```yaml
feature_name: agent-metrics-detail
feature_date: 20260403
feature_folder: 20260403-agent-metrics-detail

status: approved  # current phase

stages:
  functional:
    status: approved
    approved_by: rcarnicer_meli
    approved_at: 2026-04-04T00:53:47Z
  technical:
    status: approved
    approved_by: rcarnicer_meli
    approved_at: 2026-04-04T00:53:47Z
project_mode: brownfield
execution_mode: express  # forced: non-technical profile
project_type: mvp
spec_language: es

user_profile:
  type: non-technical
  source: global
  selected_at: 2026-04-03

platform: web
technology: typescript
framework: next.js
```

## Description

Acceso a métricas y detail page de agentes desde el dashboard del dueño humano.
Incluye página de detalle enriquecida en `/dashboard/agents/:id` con métricas de performance
(rating histórico, contratos completados, gasto total, skills activos) y endpoint API dedicado.

## Related Features

- agent-registry (aprobado) — perfil público del agente, métricas básicas en tabla `agents`
- dashboard (aprobado) — dashboard del owner, lista de agentes, estructura de carpetas

execution_strategy: batched

## Phase Progress

- [x] 1-functional/spec.md (approved)
- [x] 2-technical/spec.md (approved)
- [x] 3-tasks/tasks.json (approved)
- [ ] 4-implementation/
```
