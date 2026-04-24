# CrewLink — Full Extraction Raw Data

**Date**: 2026-04-11
**Analyst**: Meli Explorer (claude-opus-4-6)
**Method**: Exhaustive source code scan — every file read, every endpoint documented

---

## Extraction Summary

| Metric | Count |
|--------|-------|
| Source files read | 73 (all .ts/.tsx under src/ excluding __tests__) |
| Migration files read | 20 (all under supabase/migrations/) |
| API route files | 33 route.ts files |
| HTTP handlers documented | 54 (some routes export multiple methods) |
| Database tables | 8 (users, agents, skill_manifests, jobs, applications, contracts, credit_transactions, attachments, inbox_events) |
| RPC functions | 10 (4 legacy + 6 atomic) |
| Environment variables documented | 27 |
| Indexes documented | 31 |
| RLS policies documented | 7 |
| Triggers documented | 7 |
| Storage buckets | 2 |
| Cron jobs | 1 |
| Existing SDD specs (meli/wip/) | 12 features |

---

## Directory Index

```
meli/extracted/raw/
  README.md                                          <-- This file
  existing-specs/
    DETECTION_REPORT.md                              <-- Spec framework detection
  code-analysis/
    architecture/
      ARCHITECTURE.md                                <-- Full architecture, auth, env vars, security
    api-specs/
      ENDPOINTS.md                                   <-- All 54 HTTP handlers exhaustively documented
    database/
      DATABASE.md                                    <-- All tables, columns, indexes, RPCs, triggers, RLS
    deployment/
      DEPLOYMENT.md                                  <-- Vercel config, testing, actors, business logic
```

---

## Sources Read

### Configuration Files
- `/package.json` — Dependencies and scripts
- `/next.config.ts` — Security headers, server external packages
- `/vercel.json` — Cron job configuration
- `/tsconfig.json` — TypeScript configuration
- `/vitest.config.ts` — Unit test configuration
- `/vitest.e2e.config.ts` — E2E test configuration
- `/Makefile` — Local development commands
- `/CLAUDE.md` — Meli SDD Kit instructions

### Meli SDD Kit Files
- `/meli/PROJECT.md` — Project configuration
- `/meli/README.md` — Feature index
- `/meli/wip/` — 12 WIP feature specs (listed, not fully read for extraction)

### Source Files (src/)
- `middleware.ts` — Clerk middleware + public route matcher
- `lib/supabase.ts` — Supabase client factories
- `lib/errors.ts` — API error helpers
- `lib/auth/agent-auth.ts` — withAgentAuth HOF
- `lib/auth/agent-secret.ts` — Agent secret generation
- `lib/auth/api-key.ts` — Owner API key generation
- `lib/auth/jwt.ts` — JWT sign/verify
- `lib/auth/lockout.ts` — In-process lockout
- `lib/auth/ownership-check.ts` — Ownership check HOF
- `lib/auth/session-auth.ts` — withSessionAuth HOF (Clerk)
- `lib/agents/embedding.ts` — OpenAI embedding generation
- `lib/agents/manifest-validator.ts` — Ajv manifest validation
- `lib/agents/ssrf-validator.ts` — SSRF protection
- `lib/contracts/platform-fee.ts` — Tiered fee calculation
- `lib/contracts/proof-validator.ts` — Proof schema validation
- `lib/contracts/status.ts` — Status UI helpers
- `lib/credits/escrow.ts` — All escrow operations
- `lib/inbox/insert-event.ts` — Inbox event helper
- `lib/jobs/depth-checker.ts` — Chain depth + cycle detection
- `lib/security/audit.ts` — Structured audit logging
- `lib/security/lockout.ts` — Redis-backed auth lockout
- `lib/security/rate-limit.ts` — Upstash rate limiting
- `lib/storage/upload.ts` — File validation + storage operations
- All 33 route.ts files under `app/api/`
- All dashboard pages under `app/dashboard/`
- All components under `components/`
- Root layout, landing page, skill page, agent profile page, sign-in page

### Database Migrations (all 20)
- 001 through 020 inclusive

---

## Coverage Assessment

| Area | Coverage | Notes |
|------|----------|-------|
| API Endpoints | COMPLETE | All 54 handlers documented with request/response shapes |
| Database Schema | COMPLETE | All 8+1 tables, all columns, all constraints |
| RPC Functions | COMPLETE | All 10 functions with parameters and logic |
| Authentication | COMPLETE | Both Clerk and JWT flows fully documented |
| Business Logic | COMPLETE | Escrow, fees, depth, cycles, approval workflow |
| Environment Variables | COMPLETE | All 27 documented with defaults |
| Deployment | COMPLETE | Vercel, cron, testing configuration |
| Frontend Pages | PARTIAL | Architecture documented, individual page details summarized |
| Test Files | NOT READ | Intentionally excluded (not source of truth for specs) |
| Skill Markdown Files | INDEX ONLY | Content not fully extracted (would be redundant with endpoint docs) |

---

## Anti-Truncation Compliance

This extraction documents:
- ALL 54 HTTP handlers (not "and more")
- ALL 8+1 database tables with ALL columns
- ALL 31 indexes
- ALL 10 RPC functions with ALL parameters
- ALL 7 RLS policies
- ALL 7 triggers
- ALL 27 environment variables
- ALL 12 existing WIP specs (listed)

No "..." or "and X more" shortcuts were used.
