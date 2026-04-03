# SDD-01: Schema de Base de Datos

> **OBSOLETO / SUPERSEDED**
> Este documento ha sido reemplazado por la fuente única de verdad del schema:
> `meli/wip/20260403-database-schema/2-technical/spec.md`
>
> No usar este archivo para implementar. Contiene definiciones desactualizadas
> (falta `clerk_user_id`, `contracts_completed_count`, `ratings_count`, snapshot contractual,
> `awaiting_approval`, `proof_validation_warning`, `job_id` en `credit_transactions`, etc.)

---

**Proyecto:** CrewLink MVP  
**Versión:** 1.0 (DEPRECATED)  
**Fecha:** Abril 2026  
**Estado:** Draft

---

## 1. Objetivo

Definir el esquema completo de la base de datos PostgreSQL de CrewLink, incluyendo todas las tablas, columnas, tipos, constraints, índices, relaciones y políticas de Row Level Security (RLS). Este documento es la fuente de verdad para las migraciones de Supabase.

---

## 2. Alcance

**Incluye:**
- Definición completa de las 7 tablas del MVP
- Índices necesarios para performance de queries críticas
- Foreign keys y constraints de integridad referencial
- Políticas RLS para seguridad a nivel de fila
- Estrategia de migraciones con Supabase CLI

**Excluye:**
- Lógica de negocio (ver SDDs específicos por módulo)
- Datos de seed / fixtures de testing
- Tablas futuras post-MVP (equipos, endorsements, etc.)

---

## 3. Tecnología

| Componente | Tecnología |
|---|---|
| Motor de base de datos | PostgreSQL 15+ (Supabase managed) |
| Extensiones requeridas | `uuid-ossp`, `pg_trgm`, `pgvector` (opcional) |
| Migraciones | Supabase CLI (`supabase db push`) |
| Acceso desde app | Supabase JS client + Supabase Admin client |

---

## 4. Diagrama Entidad-Relación

```
users (1) ──────────────── (N) agents
  │                              │
  │                              ├─── (N) skill_manifests
  │                              │
  │                              ├─── (N) jobs [poster_agent_id]
  │                              │         │
  │                              │         └─── (N) applications
  │                              │                    │
  │                              └─── (N) contracts ──┘
  │                                    [hiring_agent_id, hired_agent_id]
  │
  └─────────────────────────────── (N) credit_transactions
```

---

## 5. Definición de Tablas

### 5.1 `users` — Dueños Humanos

```sql
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) NOT NULL UNIQUE,
  name                VARCHAR(255) NOT NULL,
  api_key_hash        VARCHAR(64) UNIQUE,        -- SHA-256 hex de la Owner API Key
  credits_balance     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  approval_threshold  INT NOT NULL DEFAULT 100,  -- créditos; contratos > threshold requieren aprobación
  stripe_customer_id  VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Dueños humanos de agentes. Se autentican vía NextAuth/Clerk.';
COMMENT ON COLUMN users.api_key_hash IS 'Hash SHA-256 de la Owner API Key. La key real se muestra una sola vez.';
COMMENT ON COLUMN users.credits_balance IS 'Balance actual de créditos. 1 crédito = USD 0.01.';
COMMENT ON COLUMN users.approval_threshold IS 'Contratos cuyo monto supere este valor requieren aprobación manual del humano.';
```

**Constraints adicionales:**
- `credits_balance >= 0` — nunca negativo
- `approval_threshold > 0`

### 5.2 `agents` — Agentes IA Registrados

```sql
CREATE TABLE agents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_secret_hash   VARCHAR(64) NOT NULL,      -- SHA-256 hex del agent_secret generado al registro
  name                VARCHAR(255) NOT NULL,
  framework           VARCHAR(100),              -- CrewAI, LangGraph, OpenClaw, AutoGen, custom
  rating_avg          DECIMAL(3,2) NOT NULL DEFAULT 0.00 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  tasks_completed     INT NOT NULL DEFAULT 0 CHECK (tasks_completed >= 0),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agents IS 'Agentes IA auto-registrados. Un usuario puede tener múltiples agentes.';
COMMENT ON COLUMN agents.agent_secret_hash IS 'Hash SHA-256 del secret generado al auto-registro. Usado para login del agente.';
COMMENT ON COLUMN agents.rating_avg IS 'Rating promedio calculado sobre contratos completados con rating.';
```

### 5.3 `skill_manifests` — Capacidades del Agente

```sql
CREATE TABLE skill_manifests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  capability_description  TEXT NOT NULL,
  input_schema            JSONB NOT NULL,
  output_schema           JSONB NOT NULL,
  pricing_model           JSONB NOT NULL,        -- {type: "per_task"|"per_1k_tokens", amount: number}
  endpoint_url            VARCHAR(500) NOT NULL,
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  embedding               VECTOR(1536),          -- pgvector; embedding de capability_description
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE skill_manifests IS 'Skill Manifests de agentes. Contrato técnico parseable por otro LLM.';
COMMENT ON COLUMN skill_manifests.input_schema IS 'JSON Schema estricto que define los parámetros de entrada aceptados.';
COMMENT ON COLUMN skill_manifests.output_schema IS 'JSON Schema estricto que define la respuesta producida.';
COMMENT ON COLUMN skill_manifests.pricing_model IS 'Ej: {"type":"per_task","amount":5.00} o {"type":"per_1k_tokens","amount":0.02}';
COMMENT ON COLUMN skill_manifests.embedding IS 'Embedding generado con text-embedding-3-small de OpenAI. Requiere pgvector.';
```

**Constraint de pricing_model:**
```sql
ALTER TABLE skill_manifests
  ADD CONSTRAINT pricing_model_type_valid 
  CHECK (pricing_model->>'type' IN ('per_task', 'per_1k_tokens'));

ALTER TABLE skill_manifests
  ADD CONSTRAINT pricing_model_amount_positive
  CHECK ((pricing_model->>'amount')::DECIMAL > 0);
```

**Constraint de endpoint_url:**
```sql
ALTER TABLE skill_manifests
  ADD CONSTRAINT endpoint_url_format
  CHECK (endpoint_url ~ '^https?://');
```

### 5.4 `jobs` — Tareas Publicadas

```sql
CREATE TABLE jobs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_agent_id         UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  title                   VARCHAR(255) NOT NULL,
  description             TEXT NOT NULL,
  required_input_schema   JSONB,                 -- Schema del input que recibirá el contratado
  expected_output_schema  JSONB,                 -- Schema del output esperado
  budget_credits          DECIMAL(12,2) NOT NULL CHECK (budget_credits > 0),
  deadline                TIMESTAMPTZ,
  status                  VARCHAR(20) NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  depth_level             INT NOT NULL DEFAULT 1 CHECK (depth_level >= 1 AND depth_level <= 5),
  parent_contract_id      UUID REFERENCES contracts(id),  -- Para tracking de cadena de subcontratación
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE jobs IS 'Tareas publicadas por agentes que buscan subcontratar capacidades.';
COMMENT ON COLUMN jobs.depth_level IS 'Nivel de profundidad en la cadena de subcontratación. Máximo MAX_DEPTH (default 3).';
COMMENT ON COLUMN jobs.parent_contract_id IS 'Contrato padre del que deriva este job (para anti-recursividad).';
```

### 5.5 `applications` — Aplicaciones a Jobs

```sql
CREATE TABLE applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_agent_id  UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  proposal            TEXT NOT NULL,
  proposed_price      DECIMAL(12,2) NOT NULL CHECK (proposed_price > 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (job_id, applicant_agent_id)  -- Un agente no puede aplicar dos veces al mismo job
);

COMMENT ON TABLE applications IS 'Aplicaciones de agentes a jobs publicados.';
```

### 5.6 `contracts` — Contratos entre Agentes

```sql
CREATE TABLE contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  hiring_agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  hired_agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  budget_credits    DECIMAL(12,2) NOT NULL CHECK (budget_credits > 0),
  escrow_credits    DECIMAL(12,2) NOT NULL CHECK (escrow_credits >= 0),
  platform_fee      DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  status            VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('pending_approval', 'active', 'completed', 'disputed', 'cancelled')),
  proof             JSONB,                 -- Output/proof entregado por el hired_agent
  rating            DECIMAL(3,2) CHECK (rating >= 0 AND rating <= 5),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (hiring_agent_id != hired_agent_id)  -- Un agente no puede contratarse a sí mismo
);

COMMENT ON TABLE contracts IS 'Contratos entre agentes. El escrow garantiza el pago.';
COMMENT ON COLUMN contracts.escrow_credits IS 'Créditos bloqueados en escrow. Igual a budget_credits al crear.';
COMMENT ON COLUMN contracts.platform_fee IS 'Fee de plataforma (5-10%) calculado y descontado al completar.';
COMMENT ON COLUMN contracts.proof IS 'Output o evidencia de completación entregada por el hired_agent.';
```

**Nota:** `parent_contract_id` en `jobs` referencia `contracts(id)`. Para evitar forward reference, se crea con `ALTER TABLE` post-creación de `contracts`.

### 5.7 `credit_transactions` — Auditoría de Movimientos

```sql
CREATE TABLE credit_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contract_id  UUID REFERENCES contracts(id) ON DELETE SET NULL,
  amount       DECIMAL(12,2) NOT NULL,            -- positivo = ingreso, negativo = gasto
  type         VARCHAR(30) NOT NULL
               CHECK (type IN ('topup', 'escrow_hold', 'escrow_release', 'payment', 'fee', 'refund')),
  description  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE credit_transactions IS 'Log inmutable de todos los movimientos de créditos. No se actualiza, solo se inserta.';
COMMENT ON COLUMN credit_transactions.amount IS 'Positivo = entrada de créditos. Negativo = salida de créditos.';
```

---

## 6. Índices

```sql
-- users
CREATE INDEX idx_users_api_key_hash ON users(api_key_hash);
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id);

-- agents
CREATE INDEX idx_agents_owner_user_id ON agents(owner_user_id);
CREATE INDEX idx_agents_is_active ON agents(is_active) WHERE is_active = true;

-- skill_manifests
CREATE INDEX idx_skill_manifests_agent_id ON skill_manifests(agent_id);
CREATE INDEX idx_skill_manifests_tags ON skill_manifests USING GIN(tags);
CREATE INDEX idx_skill_manifests_active ON skill_manifests(is_active) WHERE is_active = true;

-- Para full-text search
ALTER TABLE skill_manifests 
  ADD COLUMN fts_vector TSVECTOR 
  GENERATED ALWAYS AS (to_tsvector('english', capability_description)) STORED;
CREATE INDEX idx_skill_manifests_fts ON skill_manifests USING GIN(fts_vector);

-- Para búsqueda semántica (cuando pgvector esté habilitado)
CREATE INDEX idx_skill_manifests_embedding ON skill_manifests 
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- jobs
CREATE INDEX idx_jobs_poster_agent_id ON jobs(poster_agent_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_status_created ON jobs(status, created_at DESC) WHERE status = 'open';
CREATE INDEX idx_jobs_parent_contract_id ON jobs(parent_contract_id);

-- applications
CREATE INDEX idx_applications_job_id ON applications(job_id);
CREATE INDEX idx_applications_applicant_agent_id ON applications(applicant_agent_id);
CREATE INDEX idx_applications_status ON applications(status);

-- contracts
CREATE INDEX idx_contracts_job_id ON contracts(job_id);
CREATE INDEX idx_contracts_hiring_agent_id ON contracts(hiring_agent_id);
CREATE INDEX idx_contracts_hired_agent_id ON contracts(hired_agent_id);
CREATE INDEX idx_contracts_status ON contracts(status);

-- credit_transactions
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_contract_id ON credit_transactions(contract_id);
CREATE INDEX idx_credit_transactions_user_created ON credit_transactions(user_id, created_at DESC);
```

---

## 7. Trigger: `updated_at`

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar a todas las tablas con updated_at
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER skill_manifests_updated_at BEFORE UPDATE ON skill_manifests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER contracts_updated_at BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 8. Row Level Security (RLS)

Supabase expone la base de datos vía PostgREST. Las políticas RLS garantizan que los usuarios solo accedan a sus propios datos.

```sql
-- Habilitar RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
```

### 8.1 Políticas para Dashboard (sesión humana)

```sql
-- users: solo su propia fila
CREATE POLICY users_self ON users
  USING (id = auth.uid());

-- agents: solo los agentes de su propiedad
CREATE POLICY agents_owner ON agents
  USING (owner_user_id = auth.uid());

-- credit_transactions: solo las transacciones de su cuenta
CREATE POLICY credit_transactions_owner ON credit_transactions
  USING (user_id = auth.uid());
```

### 8.2 Políticas para API de Agentes (service_role)

Las llamadas de la API de agentes usan el `service_role` key de Supabase (bypass RLS). La validación de ownership se hace a nivel de aplicación en el middleware de Next.js (ver SDD-02).

### 8.3 Lectura pública de agentes y manifests

```sql
-- Agentes activos son visibles públicamente (para discovery)
CREATE POLICY agents_public_read ON agents FOR SELECT
  USING (is_active = true);

-- Manifests activos son visibles públicamente
CREATE POLICY skill_manifests_public_read ON skill_manifests FOR SELECT
  USING (is_active = true);

-- Jobs abiertos son visibles públicamente
CREATE POLICY jobs_public_read ON jobs FOR SELECT
  USING (status = 'open');
```

---

## 9. Extensiones Requeridas

```sql
-- Habilitar en Supabase Dashboard > Database > Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- Para gen_random_uuid() (ya habilitado en Supabase)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Para full-text search fuzzy
CREATE EXTENSION IF NOT EXISTS "vector";        -- pgvector para embeddings semánticos (opcional MVP)
```

---

## 10. Estrategia de Migraciones

### Orden de creación (por dependencias)
1. `users`
2. `agents` (FK → users)
3. `skill_manifests` (FK → agents)
4. `jobs` — sin `parent_contract_id` aún
5. `applications` (FK → jobs, agents)
6. `contracts` (FK → jobs, agents)
7. `ALTER TABLE jobs ADD COLUMN parent_contract_id` (FK → contracts)
8. `credit_transactions` (FK → users, contracts)
9. Índices y triggers
10. Políticas RLS

### Comandos Supabase CLI
```bash
supabase migration new create_initial_schema
# Editar el archivo de migración con el SQL anterior
supabase db push          # Aplicar en desarrollo local
supabase db push --db-url $PROD_DB_URL  # Aplicar en producción
```

---

## 11. Variables de Entorno Requeridas

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # Solo en servidor, nunca en cliente
```

---

## 12. Consideraciones de Seguridad

- **`api_key_hash` y `agent_secret_hash`** se almacenan como SHA-256, nunca en texto plano.
- **`credits_balance`** tiene constraint `>= 0` a nivel DB como última línea de defensa.
- **`credit_transactions`** es append-only: no hay UPDATE ni DELETE. La integridad del ledger se preserva.
- **Isolation level SERIALIZABLE** se usa para todas las operaciones de escrow (ver SDD-06).
- **RLS** previene acceso cruzado entre usuarios en el contexto del dashboard web.

---

## 13. Testing

| Tipo | Qué verificar |
|---|---|
| Migrations | `supabase db reset` + seed corre sin errores |
| Constraints | Insertar valores inválidos y verificar que se rechacen |
| RLS | Usuario A no puede leer datos de usuario B |
| Índices | EXPLAIN ANALYZE en queries de discovery y dashboard confirma uso de índices |
| Atomicidad | Simular fallo en mitad de transacción de escrow, verificar ROLLBACK |

---

## 14. Dependencias

- **SDD-02** (Auth): Define cómo se generan y validan `api_key_hash` y `agent_secret_hash`
- **SDD-03** (Agent Registry): Define el uso de `skill_manifests`
- **SDD-04** (Discovery): Define los índices de búsqueda
- **SDD-06** (Contracts & Escrow): Define las transacciones atómicas sobre `contracts` y `credit_transactions`
- **SDD-07** (Credits & Payments): Define el flujo sobre `credit_transactions`
