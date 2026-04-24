# Reporte de Discrepancias — CrewLink

**Fecha**: 2026-04-11
**Validacion**: Codigo (fuente de verdad) vs specs WIP existentes

---

## Resumen

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL | 0 |
| WARNING | 3 |
| INFO | 4 |

No se encontraron discrepancias criticas. El codigo y los specs WIP estan mayormente alineados.

---

## Discrepancias Encontradas

### D-001: FTS config cambiada de 'spanish' a 'simple' (INFO)
- **Fuente**: Migration 015 vs Migration 010
- **Detalle**: El indice FTS de skill_manifests se creo originalmente con config `'spanish'` (010) y fue cambiado a `'simple'` (015) para busqueda language-agnostic.
- **Estado**: Resuelto en codigo. Specs WIP pueden mencionar config 'spanish' como original.
- **Accion**: Ninguna (ya corregido en migration).

### D-002: RPC complete_contract_and_settle — parametro p_proof_warning cambio de TEXT a JSONB (INFO)
- **Fuente**: Migration 018 + 019
- **Detalle**: El tipo del parametro `p_proof_warning` se cambio de TEXT a JSONB. La migration 019 droppea el overload TEXT obsoleto.
- **Estado**: Resuelto. Codigo usa version JSONB.
- **Accion**: Ninguna.

### D-003: Inbox Heartbeat — codigo implementado, spec WIP incompleta (WARNING)
- **Fuente**: Codigo vs meli/wip/20260404-inbox-heartbeat/
- **Detalle**: La tabla inbox_events (020), endpoints GET/POST inbox, cron purge-inbox, y helper insert-event.ts ya estan implementados. Sin embargo la spec WIP solo tiene tasks, no functional/technical spec aprobada.
- **Accion recomendada**: Cerrar la spec con los datos del codigo actual.

### D-004: Rich Deliverables — codigo implementado, spec WIP incompleta (WARNING)
- **Fuente**: Codigo vs meli/wip/20260403-rich-deliverables/
- **Detalle**: Las tablas attachments (017), storage buckets, endpoints de job/contract attachments, confirm/download — todo implementado. Spec WIP solo tiene tasks.
- **Accion recomendada**: Cerrar la spec con los datos del codigo actual.

### D-005: Tabla count — README dice "8" pero son 9 (INFO)
- **Fuente**: meli/extracted/raw/README.md
- **Detalle**: El README de extraccion dice "8 database tables" pero lista 9 (users, agents, skill_manifests, jobs, applications, contracts, credit_transactions, attachments, inbox_events).
- **Accion**: Corregido en la spec sintetizada.

### D-006: Legacy RPCs aun presentes (WARNING)
- **Fuente**: Migration 014 (legacy) vs Migration 016 (atomic)
- **Detalle**: Las 4 RPCs legacy (hold_job_escrow, adjust_escrow, settle_contract, release_job_escrow) no fueron dropeadas. Coexisten con las 6 RPCs atomicas. El codigo usa exclusivamente las atomicas.
- **Accion recomendada**: Evaluar drop de RPCs legacy para evitar confusion.

### D-007: Variable MAX_DEPTH_LEVEL deprecada (INFO)
- **Fuente**: Codigo (src/lib/jobs/depth-checker.ts)
- **Detalle**: Existen dos variables de entorno para el mismo proposito: `MAX_AGENT_CHAIN_DEPTH` y `MAX_DEPTH_LEVEL`. El codigo prioriza `MAX_AGENT_CHAIN_DEPTH`.
- **Accion recomendada**: Remover `MAX_DEPTH_LEVEL` para claridad.
