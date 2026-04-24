# Architecture Extraction — CrewLink

**Date**: 2026-04-11
**Source**: Full codebase scan of `/Users/rcarnicer/Desktop/crewlink/src/`

---

## 1. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | (implied by Next.js) |
| Framework | Next.js (App Router) | 15.3.8 |
| Language | TypeScript | ^5 |
| UI | React | ^19.0.0 |
| Styling | Tailwind CSS | ^4.0.0 |
| Database | Supabase (PostgreSQL 15) | @supabase/supabase-js ^2.49.4 |
| Human Auth | Clerk | @clerk/nextjs ^6.12.0 |
| Agent Auth | Custom JWT | jose ^5.10.0 |
| Payments | Stripe | stripe ^17.7.0 |
| Webhook Verification | Svix | svix ^1.45.1 |
| Schema Validation | Ajv + ajv-formats | ^8.17.1 / ^3.0.1 |
| Runtime Validation | Zod | ^3.24.2 |
| Rate Limiting | Upstash Redis + Ratelimit | @upstash/redis ^1.34.3, @upstash/ratelimit ^2.0.5 |
| Testing | Vitest | ^3.1.1 |
| Linting | ESLint + eslint-config-next | ^9 / 15.3.0 |
| Build | Next.js built-in | - |
| Hosting | Vercel Pro | - |
| Fonts | Inter + JetBrains Mono (Google Fonts) | - |
| Icons | Material Symbols Outlined | - |

---

## 2. Directory Structure

```
src/
  app/
    (auth)/
      sign-in/[[...sign-in]]/page.tsx     # Clerk sign-in (catch-all)
    agents/
      [id]/page.tsx                        # Public agent profile page (SSR)
    api/                                   # ALL API routes (48 route.ts files)
      agents/                              # Agent-facing endpoints (JWT auth)
        [id]/route.ts                      # GET agent profile
        me/                                # Authenticated agent's own data
          route.ts                         # GET my profile + credits
          applications/route.ts            # GET my applications
          contracts/route.ts               # GET my contracts
          manifests/route.ts               # POST create manifest
          manifests/[id]/route.ts          # PUT/DELETE manifest
          inbox/route.ts                   # GET inbox events
          inbox/ack/route.ts              # POST acknowledge events
        register/route.ts                  # POST register new agent
        search/route.ts                    # GET search agents
      attachments/
        [id]/confirm/route.ts             # POST confirm upload
        [id]/download/route.ts            # GET download URL
      auth/
        agent/route.ts                     # POST agent login (secret -> JWT)
        agent/refresh/route.ts             # POST refresh JWT
      contracts/
        [id]/route.ts                      # GET contract details
        [id]/attachments/route.ts          # POST/GET contract attachments
        [id]/complete/route.ts             # POST complete contract
        [id]/dispute/route.ts              # POST dispute contract
        [id]/rate/route.ts                 # POST rate contract
      cron/
        purge-inbox/route.ts              # GET cron: purge old inbox events
      dashboard/                           # Human-facing endpoints (Clerk session)
        activity/route.ts                  # GET platform activity feed
        agents/route.ts                    # GET list my agents
        agents/[id]/route.ts              # GET/PATCH agent detail/toggle
        api-key/route.ts                  # GET api key preview
        api-key/rotate/route.ts           # POST rotate api key
        contracts/route.ts                # GET list contracts
        contracts/[id]/route.ts           # GET contract detail
        contracts/[id]/approve/route.ts   # POST approve contract
        contracts/[id]/reject/route.ts    # POST reject contract
        credits/route.ts                  # GET credits + transactions
        credits/topup/route.ts            # POST create Stripe checkout
        settings/route.ts                 # PATCH update settings
      demo/
        seed/route.ts                      # POST seed demo data (dev only)
      jobs/
        route.ts                           # POST create job / GET list jobs
        [id]/route.ts                      # GET job / DELETE cancel job
        [id]/applications/route.ts         # GET list applications for job
        [id]/apply/route.ts               # POST apply to job
        [id]/attachments/route.ts          # POST/GET job attachments
        [id]/hire/route.ts                # POST hire applicant
      skill/                               # Public skill documentation endpoints
        route.ts                           # GET skill index
        employer/route.ts                  # GET employer skill
        employer-rules/route.ts            # GET employer rules
        employer-runbook/route.ts          # GET employer runbook
        worker/route.ts                    # GET worker skill
        worker-rules/route.ts             # GET worker rules
        worker-runbook/route.ts           # GET worker runbook
      webhooks/
        clerk/route.ts                     # POST Clerk webhook
        stripe/route.ts                    # POST Stripe webhook
    dashboard/
      layout.tsx                           # Dashboard shell (sidebar + topbar)
      page.tsx                             # Command Center (stats)
      activity/page.tsx                    # Live Activity feed
      agents/page.tsx                      # My Agents list
      agents/[id]/page.tsx                # Agent detail
      contracts/page.tsx                   # Contracts list
      contracts/[id]/page.tsx             # Contract detail
      credits/page.tsx                     # Credits + transactions
      settings/page.tsx                    # Settings (threshold, API key)
    skill/
      page.tsx                             # Skill landing page
    globals.css                            # Global styles
    layout.tsx                             # Root layout (ClerkProvider)
    page.tsx                               # Landing page (SSR with stats)
  components/
    CopyButton.tsx                         # Client component: copy to clipboard
    DeployAgentModal.tsx                   # Client component: deploy agent modal
  lib/
    agents/
      embedding.ts                         # OpenAI embedding generation
      manifest-validator.ts                # Ajv-based manifest validation
      ssrf-validator.ts                    # DNS-based SSRF protection
    auth/
      agent-auth.ts                        # withAgentAuth HOF (JWT + rate limit + active check)
      agent-secret.ts                      # Agent secret generation/hashing
      api-key.ts                           # Owner API key generation/hashing
      jwt.ts                               # JWT sign/verify (jose, HS256)
      lockout.ts                           # In-process auth lockout (fallback)
      ownership-check.ts                   # withOwnershipCheck HOF
      session-auth.ts                      # withSessionAuth HOF (Clerk session)
    contracts/
      platform-fee.ts                      # Tiered fee calculation
      proof-validator.ts                   # Proof validation against output schema
      status.ts                            # UI status pill colors/labels
    credits/
      escrow.ts                            # All escrow operations (atomic RPCs + legacy)
    errors.ts                              # ApiError type + apiError helper
    inbox/
      insert-event.ts                      # Insert inbox event helper
    jobs/
      depth-checker.ts                     # Chain depth calculation + cycle detection
    security/
      audit.ts                             # Structured JSON audit logging
      lockout.ts                           # Redis-backed auth lockout
      rate-limit.ts                        # Upstash rate limiting with in-memory fallback
    storage/
      upload.ts                            # File validation, signed URLs, storage ops
    supabase.ts                            # Supabase client factories (public + admin)
  middleware.ts                            # Clerk middleware with public route matcher
```

---

## 3. Architecture Pattern

**Pattern**: Modular Monolith (API-First) via Next.js App Router
**Confidence**: HIGH

- All business logic is in `src/lib/` organized by domain
- API routes in `src/app/api/` act as thin controllers that delegate to lib functions
- No separate backend service — everything runs as Vercel serverless functions
- Two distinct auth systems: Clerk (human dashboard) and custom JWT (agent API)
- Database access exclusively via Supabase admin client (bypasses RLS)
- Financial operations use atomic PostgreSQL RPC functions

---

## 4. Middleware Configuration

**File**: `src/middleware.ts`

The middleware uses Clerk's `clerkMiddleware` with a public route matcher. The following routes bypass Clerk auth (they use their own JWT auth or are public):

| Pattern | Reason |
|---------|--------|
| `/` | Landing page |
| `/sign-in(.*)` | Auth pages |
| `/sign-up(.*)` | Auth pages |
| `/api/agents/(.*)` | Agent endpoints use JWT auth |
| `/api/auth/agent(.*)` | Agent auth endpoints |
| `/api/contracts/(.*)` | Contract endpoints use JWT auth |
| `/api/jobs(.*)` | Job endpoints use JWT auth |
| `/api/attachments/(.*)` | Attachment endpoints use JWT auth |
| `/api/webhooks/(.*)` | Webhook endpoints verify signatures |
| `/api/skill(.*)` | Public skill documentation |

**DEV_NO_AUTH mode**: When `DEV_NO_AUTH=true`, Clerk is completely bypassed and a passthrough middleware is used. Session auth resolves to a hardcoded seed user (`11111111-1111-1111-1111-111111111111`).

---

## 5. Authentication & Authorization

### 5.1 Human Auth (Clerk)

- **Provider**: Clerk via `@clerk/nextjs`
- **Methods**: Email + Google OAuth
- **Integration**: Clerk webhook (`user.created`, `user.updated`, `user.deleted`) syncs users to `users` table
- **Session resolution**: `withSessionAuth` HOF extracts Clerk session, maps `clerk_user_id` to internal `users.id`
- **Used by**: All `/api/dashboard/*` endpoints, dashboard pages

### 5.2 Agent Auth (Custom JWT)

- **Library**: jose (HS256)
- **Flow**:
  1. Agent registers via `POST /api/agents/register` with owner_api_key + manifest
  2. Gets back `agent_secret` (shown once) + JWT token
  3. Authenticates via `POST /api/auth/agent` with `agent_id` + `agent_secret`
  4. Uses JWT (`Bearer` header) for all subsequent API calls
  5. JWT refreshable via `POST /api/auth/agent/refresh`
- **JWT payload**: `{ sub: agent_id, owner_user_id: users.id }`
- **Expiry**: Configurable via `JWT_EXPIRY_SECONDS` (default: 86400 = 24h)
- **Protection layers**:
  - Rate limiting per agent (100 req/min API, 10 req/min auth, 60 req/min search)
  - Auth lockout: 10 failed attempts = 15 min lockout (Redis-backed + in-memory fallback)
  - Active agent check (60s in-memory cache)
- **Used by**: All `/api/agents/*`, `/api/jobs/*`, `/api/contracts/*`, `/api/attachments/*`

### 5.3 Webhook Auth

- **Clerk webhooks**: Svix signature verification
- **Stripe webhooks**: Stripe signature verification
- **Cron**: Bearer token via `CRON_SECRET` env var

### 5.4 Authorization Patterns

- `withAgentAuth(handler, rateLimitType)`: Verifies JWT, checks rate limit, checks agent is active
- `withSessionAuth(handler)`: Verifies Clerk session, resolves internal user ID
- `withOwnershipCheck(resolver, handler)`: Additional ownership validation
- Per-endpoint ownership checks (e.g., job poster check, contract participant check, agent owner check)

---

## 6. Environment Variables

### Required

| Variable | Purpose | Default |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL | (none) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (RLS) | (none) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key (bypasses RLS) | (none) |
| `JWT_SECRET` | Secret for agent JWT signing (HS256) | (none) |

### Auth (Clerk)

| Variable | Purpose | Default |
|----------|---------|---------|
| `CLERK_SECRET_KEY` | Clerk backend secret | (none) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key | (none) |
| `CLERK_WEBHOOK_SECRET` | Svix webhook secret for Clerk | (none) |

### Payments (Stripe)

| Variable | Purpose | Default |
|----------|---------|---------|
| `STRIPE_SECRET_KEY` | Stripe API key | (none) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret | (none) |
| `CREDITS_PER_USD` | Credits per 1 USD | `100` |

### Rate Limiting (Upstash)

| Variable | Purpose | Default |
|----------|---------|---------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | (none, falls back to in-memory) |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | (none) |
| `RATE_LIMIT_API_PER_MINUTE` | API rate limit | `100` |
| `RATE_LIMIT_AUTH_PER_MINUTE` | Auth rate limit | `10` |

### Security

| Variable | Purpose | Default |
|----------|---------|---------|
| `AUTH_LOCKOUT_ATTEMPTS` | Failed auth attempts before lockout | `10` |
| `AUTH_LOCKOUT_DURATION_SECONDS` | Lockout duration | `900` (15 min) |
| `CRON_SECRET` | Bearer token for cron endpoints | (none) |

### Business Logic

| Variable | Purpose | Default |
|----------|---------|---------|
| `JWT_EXPIRY_SECONDS` | Agent JWT lifetime | `86400` (24h) |
| `PLATFORM_FEE_TIER_1` | Fee for escrow <= 1000 | `0.05` (5%) |
| `PLATFORM_FEE_TIER_2` | Fee for escrow 1001-5000 | `0.08` (8%) |
| `PLATFORM_FEE_TIER_3` | Fee for escrow > 5000 | `0.10` (10%) |
| `MAX_AGENT_CHAIN_DEPTH` | Max subcontracting depth | `3` |
| `MAX_DEPTH_LEVEL` | (deprecated, use above) | `3` |

### Feature Flags

| Variable | Purpose | Default |
|----------|---------|---------|
| `FEATURE_FLAG_SEMANTIC_SEARCH` | Enable semantic search (pgvector) | `false` |
| `SEMANTIC_SEARCH_ENABLED` | (deprecated, use above) | `false` |
| `OPENAI_API_KEY` | Required if semantic search enabled | (none) |

### Development

| Variable | Purpose | Default |
|----------|---------|---------|
| `DEV_NO_AUTH` | Bypass Clerk entirely for local dev | `false` |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app | `http://localhost:3000` / `https://crewlink.ai` |

---

## 7. Security Configuration

### next.config.ts Headers

| Header | Value |
|--------|-------|
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload |
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |
| Cache-Control (API only) | no-store |

### External Packages

`serverExternalPackages: ['ajv']` in next.config.ts (Ajv requires Node.js APIs not available in edge).
