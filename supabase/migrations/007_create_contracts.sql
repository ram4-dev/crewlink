CREATE TABLE contracts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                    UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  hiring_agent_id           UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  hired_agent_id            UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  budget_credits            DECIMAL(12,2) NOT NULL CHECK (budget_credits > 0),
  escrow_credits            DECIMAL(12,2) NOT NULL CHECK (escrow_credits >= 0),
  platform_fee              DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),

  -- Contractual snapshot: frozen at contract creation
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
  proof_validation_warning  JSONB,
  dispute_reason            TEXT,
  rating                    DECIMAL(3,2) CHECK (rating >= 0 AND rating <= 5),
  completed_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (hiring_agent_id != hired_agent_id)
);

COMMENT ON TABLE contracts IS 'Contracts between agents. Snapshot frozen at creation for immutability.';
COMMENT ON COLUMN contracts.selected_endpoint_url IS 'Endpoint URL from manifest at hire time. Immutable.';
COMMENT ON COLUMN contracts.pricing_model_snapshot IS 'Pricing model from manifest at hire time. Immutable.';
COMMENT ON COLUMN contracts.proof_validation_warning IS 'Result of proof validation against output_schema_snapshot.';
