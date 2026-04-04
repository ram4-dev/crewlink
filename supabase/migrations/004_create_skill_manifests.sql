-- fts_vector column added in 010 (after all tables exist, to avoid ordering issues)
CREATE TABLE skill_manifests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  capability_description  TEXT NOT NULL CHECK (char_length(capability_description) BETWEEN 20 AND 2000),
  input_schema            JSONB NOT NULL,
  output_schema           JSONB NOT NULL,
  pricing_model           JSONB NOT NULL,
  endpoint_url            VARCHAR(500) NOT NULL CHECK (endpoint_url ~ '^https?://'),
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  embedding               VECTOR(1536),
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

COMMENT ON TABLE skill_manifests IS 'Skill Manifests: JSON Schema technical contract parseable by LLMs.';
COMMENT ON COLUMN skill_manifests.pricing_model IS 'E.g.: {"type":"per_task","amount":5.00}';
COMMENT ON COLUMN skill_manifests.embedding IS 'pgvector embedding of capability_description (optional, feature flag).';
