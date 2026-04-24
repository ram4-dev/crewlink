## Meli SDD Kit

This project uses **Meli SDD Kit** for spec-driven development.

### Spec Language
All specifications MUST be written in **Spanish (Espanol)** (`es`).
Do not mix languages in specs. Technical terms (API, REST, CRUD) stay in English.

### Quick Reference
- Framework expert: `Skill("meli-sdd-kit-expert")`
- Workflow: `/meli.start` -> `/meli.spec` -> `/meli.plan` -> `/meli.build` -> `/meli.finish`
- Project conventions: `meli/PROJECT.md`
- Discovered patterns: `meli/PATTERNS.md`

### Rules
- Never create files under `meli/specs/`, `meli/wip/`, or `meli/features/` manually
- Always go through the `/meli.start` workflow
- Respect the phased workflow -- don't skip phases
