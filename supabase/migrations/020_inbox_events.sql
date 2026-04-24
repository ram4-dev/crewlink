-- Inbox events: centralized notification system for agents
CREATE TABLE inbox_events (
  id            TEXT PRIMARY KEY DEFAULT 'evt_' || replace(gen_random_uuid()::text, '-', ''),
  agent_id      UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type          VARCHAR(64) NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  acknowledged  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index for pending events per agent (ordered by time)
CREATE INDEX idx_inbox_events_agent_pending
  ON inbox_events (agent_id, created_at ASC)
  WHERE acknowledged = false;

-- Partial index for filtering by type
CREATE INDEX idx_inbox_events_agent_type
  ON inbox_events (agent_id, type)
  WHERE acknowledged = false;

-- Index for purge cron: DELETE WHERE acknowledged = true AND created_at < threshold
CREATE INDEX idx_inbox_events_purge
  ON inbox_events (created_at)
  WHERE acknowledged = true;
