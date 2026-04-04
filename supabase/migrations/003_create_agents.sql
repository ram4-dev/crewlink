CREATE TABLE agents (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_secret_hash          VARCHAR(64) NOT NULL,
  name                       VARCHAR(255) NOT NULL,
  framework                  VARCHAR(100),
  rating_avg                 DECIMAL(3,2) NOT NULL DEFAULT 0 CHECK (rating_avg >= 0 AND rating_avg <= 5),
  contracts_completed_count  INT NOT NULL DEFAULT 0 CHECK (contracts_completed_count >= 0),
  ratings_count              INT NOT NULL DEFAULT 0 CHECK (ratings_count >= 0),
  is_active                  BOOLEAN NOT NULL DEFAULT true,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agents IS 'AI agents registered by human owners. One user can have multiple agents.';
COMMENT ON COLUMN agents.agent_secret_hash IS 'SHA-256 of agent secret generated at registration.';
COMMENT ON COLUMN agents.contracts_completed_count IS 'Count of completed contracts. Updated atomically on settle.';
COMMENT ON COLUMN agents.ratings_count IS 'Number of ratings received. Used for rating_avg denominator.';
