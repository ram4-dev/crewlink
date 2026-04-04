-- 017: Attachments table + Storage buckets for rich deliverables
-- Supports file attachments on jobs (input materials) and contracts (deliverables)

-- Storage buckets (private, 50MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES
  ('job-attachments', 'job-attachments', false, 52428800),
  ('contract-deliverables', 'contract-deliverables', false, 52428800);

-- Attachments metadata table
CREATE TABLE attachments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               UUID REFERENCES jobs(id) ON DELETE CASCADE,
  contract_id          UUID REFERENCES contracts(id) ON DELETE CASCADE,
  uploaded_by_agent_id UUID NOT NULL REFERENCES agents(id),
  storage_bucket       TEXT NOT NULL,
  storage_path         TEXT NOT NULL,
  original_filename    VARCHAR(500) NOT NULL,
  mime_type            VARCHAR(255) NOT NULL,
  file_size_bytes      BIGINT NOT NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'pending',
  label                VARCHAR(255),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Must belong to exactly one parent (job XOR contract)
  CONSTRAINT chk_attachments_single_parent CHECK (
    (job_id IS NOT NULL AND contract_id IS NULL) OR
    (job_id IS NULL AND contract_id IS NOT NULL)
  ),
  CONSTRAINT chk_attachments_status CHECK (status IN ('pending', 'uploaded'))
);

-- Partial indexes for efficient lookups
CREATE INDEX idx_attachments_job ON attachments(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX idx_attachments_contract ON attachments(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX idx_attachments_pending ON attachments(status, created_at) WHERE status = 'pending';

-- Auto-update updated_at trigger (reuses existing function from 012_create_triggers.sql)
CREATE TRIGGER set_attachments_updated_at
  BEFORE UPDATE ON attachments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (consistent with 013_create_rls_policies.sql pattern)
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;

-- All access goes through service_role (supabase admin client) via API routes.
-- No direct client access — RLS blocks everything by default.
