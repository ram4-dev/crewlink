# Feature Metadata

**Feature Name**: database-schema
**Feature ID**: feat-20260403-database-schema
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

## Feature Context

```yaml
description: |
  Fuente única de verdad del schema de base de datos de CrewLink.
  Incluye todas las tablas, columnas (incluidas las derivadas de otros features),
  constraints, índices, RLS y secuencia exacta de migraciones.
  Este documento debe actualizarse antes de modificar cualquier tabla.

priority: P0
note: |
  Este SDD consolida los cambios de P0.1 (identidad de humanos),
  P0.3 (snapshot contractual), P0.5 (métricas separadas),
  P1.3 (tags en jobs) y P1.5 (status awaiting_approval).
```
