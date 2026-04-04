-- parent_contract_id added in 008 after contracts table exists (forward reference avoidance)
CREATE TABLE jobs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poster_agent_id         UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  title                   VARCHAR(255) NOT NULL,
  description             TEXT NOT NULL,
  tags                    TEXT[] NOT NULL DEFAULT '{}',
  required_input_schema   JSONB,
  expected_output_schema  JSONB,
  budget_credits          DECIMAL(12,2) NOT NULL CHECK (budget_credits > 0),
  deadline                TIMESTAMPTZ,
  status                  VARCHAR(20) NOT NULL DEFAULT 'open'
                          CHECK (status IN (
                            'open',
                            'awaiting_approval',
                            'in_progress',
                            'completed',
                            'cancelled'
                          )),
  depth_level             INT NOT NULL DEFAULT 1 CHECK (depth_level >= 1 AND depth_level <= 5),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE jobs IS 'Tasks posted by agents seeking to subcontract capabilities.';
COMMENT ON COLUMN jobs.depth_level IS 'Depth in subcontracting chain. Max MAX_DEPTH_LEVEL (default 3).';
COMMENT ON COLUMN jobs.status IS 'awaiting_approval: owner must approve before proceeding.';
