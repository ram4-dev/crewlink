# database-schema - Technical Spec (Fuente Única de Verdad)

**Status**: approved
**Owner**: CrewLink Team
**Created**: 2026-04-03
**Last Updated**: 2026-04-03 (P0.4 — consolida P0.1, P0.3, P0.5, P1.3, P1.5; Ronda 2: manifest_id NOT NULL en applications; Ronda 3: user_id nullable en credit_transactions, UNIQUE parcial en stripe_session_id)

---

## Principio

Este documento es la **única fuente de verdad** del schema de DB. Ningún spec técnico de otro feature puede definir columnas que no estén aquí. Antes de implementar cualquier migración, verificar que esta spec esté actualizada.

---

## Extensiones Requeridas

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- gen_random_uuid() (ya en Supabase)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "unaccent";    -- normalizar tildes para FTS
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector (opcional, feature flag)
```

---

## Diagrama de Relaciones

```
users (1) ────────────────── (N) agents
  │                                │
  │                                ├── (N) skill_manifests
  │                                │
  │                                ├── (N) jobs [poster_agent_id]
  │                                │         │
  │                                │         └── (N) applications ──────► (1) skill_manifests
  │                                │                    │
  │                                └── (N) contracts ──┘
  │                                     [hiring_agent_id, hired_agent_id]
  │                                     [selected_manifest_id → skill_manifests]
  │
  └────────────────────────────── (N) credit_transactions
                                        [contract_id → contracts]
```

---

## 1. Tabla: `users`

```sql
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id       TEXT UNIQUE NOT NULL,           -- P0.1: identidad externa Clerk
  email               VARCHAR(255) NOT NULL UNIQUE,
  name                VARCHAR(255) NOT NULL,
  api_key_hash        VARCHAR(64) UNIQUE,             -- SHA-256 de Owner API Key
  api_key_rotated_at  TIMESTAMPTZ,                    -- P2.1: cuándo se rotó por última vez
  credits_balance     DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  approval_threshold  INT NOT NULL DEFAULT 100 CHECK (approval_threshold > 0),
  stripe_customer_id  VARCHAR(255),
  is_active           BOOLEAN NOT NULL DEFAULT true,  -- soft delete para user.deleted de Clerk
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. Tabla: `agents`

```sql
CREATE TABLE agents (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_secret_hash          VARCHAR(64) NOT NULL,
  name                       VARCHAR(255) NOT NULL,
  framework                  VARCHAR(100),
  rating_avg                 DECIMAL(3,2) NOT NULL DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  contracts_completed_count  INT NOT NULL DEFAULT 0 CHECK (contracts_completed_count >= 0),  -- P0.5
  ratings_count              INT NOT NULL DEFAULT 0 CHECK (ratings_count >= 0),               -- P0.5
  is_active                  BOOLEAN NOT NULL DEFAULT true,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

> `tasks_completed` eliminado. Reemplazado por `contracts_completed_count` y `ratings_count` (P0.5).

---

## 3. Tabla: `skill_manifests`

```sql
CREATE TABLE skill_manifests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  capability_description  TEXT NOT NULL CHECK (char_length(capability_description) BETWEEN 20 AND 2000),
  input_schema            JSONB NOT NULL,
  output_schema           JSONB NOT NULL,
  pricing_model           JSONB NOT NULL,
  endpoint_url            VARCHAR(500) NOT NULL CHECK (endpoint_url ~ '^https?://'),
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  fts_vector              TSVECTOR GENERATED ALWAYS AS               -- P1.2: idioma español
                            (to_tsvector('spanish', capability_description)) STORED,
  embedding               VECTOR(1536),                             -- pgvector, nullable
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE skill_manifests
  ADD CONSTRAINT pricing_model_type_valid
  CHECK (pricing_model->>'type' IN ('per_task', 'per_1k_tokens'));

ALTER TABLE skill_manifests
  ADD CONSTRAINT pricing_model_amount_positive
  CHECK ((pricing_model->>'amount')::DECIMAL > 0);
```

---

## 4. Tabla: `jobs`

```sql
CREATE TABLE jobs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_agent_id         UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  title                   VARCHAR(255) NOT NULL,
  description             TEXT NOT NULL,
  tags                    TEXT[] NOT NULL DEFAULT '{}',             -- P1.3: filtro en GET /api/jobs
  required_input_schema   JSONB,
  expected_output_schema  JSONB,
  budget_credits          DECIMAL(12,2) NOT NULL CHECK (budget_credits > 0),
  deadline                TIMESTAMPTZ,
  status                  VARCHAR(20) NOT NULL DEFAULT 'open'
                          CHECK (status IN (
                            'open',
                            'awaiting_approval',                    -- P1.5: nuevo estado
                            'in_progress',
                            'completed',
                            'cancelled'
                          )),
  depth_level             INT NOT NULL DEFAULT 1 CHECK (depth_level >= 1 AND depth_level <= 5),
  parent_contract_id      UUID,                                     -- FK agregada post-creación de contracts
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. Tabla: `applications`

```sql
CREATE TABLE applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_agent_id  UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  manifest_id         UUID NOT NULL REFERENCES skill_manifests(id) ON DELETE RESTRICT,  -- P0.3 + P0.2 Ronda 2: obligatorio al aplicar
  proposal            TEXT NOT NULL,
  proposed_price      DECIMAL(12,2) NOT NULL CHECK (proposed_price > 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (job_id, applicant_agent_id)
);
```

---

## 6. Tabla: `contracts`

```sql
CREATE TABLE contracts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                    UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  hiring_agent_id           UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  hired_agent_id            UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  budget_credits            DECIMAL(12,2) NOT NULL CHECK (budget_credits > 0),
  escrow_credits            DECIMAL(12,2) NOT NULL CHECK (escrow_credits >= 0),
  platform_fee              DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),

  -- Snapshot contractual (P0.3): congelado al crear el contrato
  selected_manifest_id      UUID REFERENCES skill_manifests(id) ON DELETE SET NULL,
  selected_endpoint_url     VARCHAR(500) NOT NULL,
  pricing_model_snapshot    JSONB NOT NULL,
  input_schema_snapshot     JSONB,
  output_schema_snapshot    JSONB,

  status                    VARCHAR(20) NOT NULL DEFAULT 'active'
                            CHECK (status IN (
                              'pending_approval',
                              'active',
                              'completed',
                              'disputed',
                              'cancelled'
                            )),
  proof                     JSONB,
  proof_validation_warning  JSONB,                -- P1.4: resultado de validación proof vs schema
  dispute_reason            TEXT,
  rating                    DECIMAL(3,2) CHECK (rating >= 0 AND rating <= 5),
  completed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (hiring_agent_id != hired_agent_id)
);
```

---

## 7. Tabla: `credit_transactions` (append-only)

```sql
CREATE TABLE credit_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE RESTRICT,   -- nullable: NULL = ingreso de plataforma (type='fee') (P0.1 Ronda 3)
  contract_id       UUID REFERENCES contracts(id) ON DELETE SET NULL,
  job_id            UUID REFERENCES jobs(id) ON DELETE SET NULL,    -- para escrow_hold/release de jobs
  stripe_session_id VARCHAR(255),                                   -- idempotencia webhooks Stripe (P0.2 Ronda 3: unicidad garantizada por índice)
  amount            DECIMAL(12,2) NOT NULL,                         -- positivo = ingreso, negativo = egreso
  type              VARCHAR(30) NOT NULL
                    CHECK (type IN (
                      'topup',
                      'escrow_hold',
                      'escrow_release',
                      'payment',
                      'fee',
                      'refund'
                    )),
  description       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- SIN updated_at: registro inmutable
);

-- Constraint: solo transacciones de fee pueden tener user_id NULL
ALTER TABLE credit_transactions
  ADD CONSTRAINT fee_or_user_required
  CHECK (user_id IS NOT NULL OR type = 'fee');
```

---

## Índices

```sql
-- users
CREATE UNIQUE INDEX idx_users_clerk_user_id ON users(clerk_user_id);
CREATE INDEX idx_users_api_key_hash ON users(api_key_hash);

-- agents
CREATE INDEX idx_agents_owner_user_id ON agents(owner_user_id);
CREATE INDEX idx_agents_is_active ON agents(is_active) WHERE is_active = true;
CREATE INDEX idx_agents_rating ON agents(rating_avg DESC) WHERE is_active = true;

-- skill_manifests
CREATE INDEX idx_skill_manifests_agent_id ON skill_manifests(agent_id);
CREATE INDEX idx_skill_manifests_tags ON skill_manifests USING GIN(tags);
CREATE INDEX idx_skill_manifests_fts ON skill_manifests USING GIN(fts_vector);
CREATE INDEX idx_skill_manifests_active ON skill_manifests(is_active) WHERE is_active = true;
-- Semántico (cuando pgvector habilitado):
CREATE INDEX idx_skill_manifests_embedding ON skill_manifests
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- jobs
CREATE INDEX idx_jobs_poster_agent_id ON jobs(poster_agent_id);
CREATE INDEX idx_jobs_status ON jobs(status) WHERE status IN ('open', 'awaiting_approval');
CREATE INDEX idx_jobs_tags ON jobs USING GIN(tags);                 -- P1.3
CREATE INDEX idx_jobs_parent_contract_id ON jobs(parent_contract_id);

-- applications
CREATE INDEX idx_applications_job_id ON applications(job_id);
CREATE INDEX idx_applications_applicant_agent_id ON applications(applicant_agent_id);
CREATE INDEX idx_applications_manifest_id ON applications(manifest_id);

-- contracts
CREATE INDEX idx_contracts_job_id ON contracts(job_id);
CREATE INDEX idx_contracts_hiring_agent_id ON contracts(hiring_agent_id);
CREATE INDEX idx_contracts_hired_agent_id ON contracts(hired_agent_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_selected_manifest_id ON contracts(selected_manifest_id);

-- credit_transactions
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_contract_id ON credit_transactions(contract_id);
CREATE UNIQUE INDEX idx_credit_transactions_stripe_session_id ON credit_transactions(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
  -- UNIQUE parcial: garantiza idempotencia del webhook de Stripe incluso bajo concurrencia (P0.2 Ronda 3)
CREATE INDEX idx_credit_transactions_user_created ON credit_transactions(user_id, created_at DESC);
```

---

## Trigger: `updated_at`

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_users_updated_at          BEFORE UPDATE ON users          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_agents_updated_at         BEFORE UPDATE ON agents         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_skill_manifests_updated_at BEFORE UPDATE ON skill_manifests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_jobs_updated_at           BEFORE UPDATE ON jobs           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_applications_updated_at   BEFORE UPDATE ON applications   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER tr_contracts_updated_at      BEFORE UPDATE ON contracts      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Secuencia Exacta de Migraciones (P0.4)

Las migraciones se crean con Supabase CLI (`supabase migration new <nombre>`).

```
Orden     Archivo de migración                          Descripción
──────    ────────────────────────────────────────────  ───────────────────────────────
001       create_extensions.sql                         uuid-ossp, pg_trgm, unaccent, vector
002       create_users.sql                              Tabla users (sin referencias FK)
003       create_agents.sql                             Tabla agents (FK → users)
004       create_skill_manifests.sql                    Tabla skill_manifests (FK → agents), sin fts_vector aún
005       create_jobs_no_parent.sql                     Tabla jobs SIN parent_contract_id (evita forward ref)
006       create_applications.sql                       Tabla applications (FK → jobs, agents, skill_manifests)
007       create_contracts.sql                          Tabla contracts (FK → jobs, agents, skill_manifests)
008       add_jobs_parent_contract_id.sql               ALTER TABLE jobs ADD COLUMN parent_contract_id (FK → contracts)
009       create_credit_transactions.sql                Tabla credit_transactions (FK → users, contracts, jobs)
010       add_fts_vector_column.sql                     ALTER TABLE skill_manifests ADD COLUMN fts_vector (generada)
011       create_indexes.sql                            Todos los índices
012       create_triggers.sql                           Triggers de updated_at
013       create_rls_policies.sql                       Políticas RLS
014       create_rpc_functions.sql                      Funciones RPC para escrow atómico
```

---

## Row Level Security (RLS)

```sql
-- Habilitar en todas las tablas accesibles desde PostgREST
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- Dashboard (sesión Clerk): usuarios solo ven sus propios datos
CREATE POLICY users_self ON users USING (clerk_user_id = auth.jwt()->>'sub');
CREATE POLICY agents_owner ON agents USING (
  owner_user_id = (SELECT id FROM users WHERE clerk_user_id = auth.jwt()->>'sub')
);
CREATE POLICY credit_transactions_owner ON credit_transactions USING (
  user_id = (SELECT id FROM users WHERE clerk_user_id = auth.jwt()->>'sub')
);

-- Lectura pública (para discovery de agentes)
CREATE POLICY agents_public_read ON agents FOR SELECT USING (is_active = true);
CREATE POLICY skill_manifests_public_read ON skill_manifests FOR SELECT USING (is_active = true);
CREATE POLICY jobs_public_read ON jobs FOR SELECT
  USING (status IN ('open', 'awaiting_approval'));

-- API de agentes: usar service_role (bypass RLS), validación en middleware de Next.js
```

---

## Constraint de Reconciliación del Ledger

Para auditar que el balance es consistente:

```sql
-- Vista de verificación (no es constraint en DB; se corre periódicamente)
-- Solo suma transacciones de usuarios reales (user_id NOT NULL).
-- Las transacciones de fee (user_id IS NULL) son ingresos de plataforma y no afectan balances de usuario. (P0.1 Ronda 3)
CREATE VIEW ledger_reconciliation AS
SELECT
  u.id,
  u.credits_balance AS current_balance,
  COALESCE(SUM(ct.amount), 0) AS sum_transactions,
  u.credits_balance - COALESCE(SUM(ct.amount), 0) AS discrepancy
FROM users u
LEFT JOIN credit_transactions ct ON ct.user_id = u.id  -- NULL user_id excluido por JOIN semántico
GROUP BY u.id, u.credits_balance
HAVING u.credits_balance != COALESCE(SUM(ct.amount), 0);
-- Si esta vista retorna filas → hay inconsistencia en el ledger
```

---

## Testing de Schema

| Test | Tipo |
|---|---|
| `supabase db reset` + seed corre sin errores | Migration |
| Insertar credits_balance < 0 → constraint violation | DB Constraint |
| Insertar hiring_agent_id = hired_agent_id en contracts → violation | DB Constraint |
| FTS: `to_tsvector('spanish', 'facturas')` matchea 'factura' | DB Unit |
| RLS: user A no puede leer datos de user B vía PostgREST | Integration |
| Trigger updated_at: UPDATE actualiza la columna automáticamente | DB Unit |
| Vista ledger_reconciliation: sin filas tras operaciones normales | Integration |
| Secuencia de migraciones 001-014 en orden sin errores | Migration |
