# Project Configuration

---

## Project Vision

```yaml
vision:
  summary: "Marketplace peer-to-peer donde agentes de IA se registran, descubren y contratan entre sí de forma autónoma"

  target_users:
    - "Agente IA: necesita subcontratar capacidades que no posee (OCR, traducción, análisis financiero)"
    - "Humano dueño: supervisa agentes, recarga créditos, aprueba contratos grandes"

  value_proposition: |
    Los agentes IA operan en silos. CrewLink es el protocolo estandarizado para que
    un agente descubra, evalúe, contrate y pague a otro agente de forma programática
    sin intervención humana. El Skill Manifest (JSON Schema) es el contrato técnico
    que permite que un LLM evalúe compatibilidad y contrate autónomamente.

  principles:
    - "API-First: toda funcionalidad se expone como REST/JSON. El dashboard es solo un consumer más"
    - "Agent-Native: endpoints diseñados para que un LLM los invoque sin intervención humana"
    - "Escrow-First: ningún crédito se mueve sin garantía. Transacciones atómicas en Postgres"
    - "Skill Manifest como contrato: JSON Schema estricto define la interoperabilidad"

  anti_goals:
    - "No es un gateway/proxy intermediario (comunicación directa entre agentes post-matching)"
    - "No tiene chat agent-to-agent ni equipos persistentes (post-MVP)"
    - "No tiene pagos crypto ni wallets (créditos internos + Stripe es suficiente para MVP)"
```

---

## Team Conventions

```yaml
language:
  specs: es
  comments: en
```

---

## Technology Preferences

```yaml
stack:
  frontend: "Next.js 15 + TypeScript + Tailwind CSS"
  backend: "Next.js App Router API Routes"
  database: "Supabase (PostgreSQL 15)"
  auth_human: "Clerk (email + Google OAuth)"
  auth_agent: "Custom JWT (jose library, 24h)"
  payments: "Stripe Checkout"
  search: "PostgreSQL full-text + pgvector (opcional)"
  hosting: "Vercel Pro + Supabase Pro"
  testing: "Vitest (unit) + Playwright (E2E)"
```

---

## Quality Gates

```yaml
coverage:
  min_coverage: 70
  critical_paths_only: false

reviews:
  code_review: mandatory
  spec_approval: mandatory

  security_review_for:
    - auth
    - payments
    - escrow
```

---

## Default Feature Settings

```yaml
defaults:
  project_type: mvp
  ltp_enabled: false
  atlassian_mcp_enabled: false
  execution_strategy: sequential
  user_profile: non-technical
```

---

## Registered Overrides

```yaml
overrides:
  - standard: fury-compliance
    rule: "Fury app required"
    project_value: "No Fury app (Next.js + Vercel)"
    reason: "CrewLink es un proyecto Next.js deployado en Vercel, no en Fury"
    registered_at: 2026-04-03
```
