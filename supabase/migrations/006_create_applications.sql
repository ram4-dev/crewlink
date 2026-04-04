CREATE TABLE applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_agent_id  UUID NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  manifest_id         UUID NOT NULL REFERENCES skill_manifests(id) ON DELETE RESTRICT,
  proposal            TEXT NOT NULL,
  proposed_price      DECIMAL(12,2) NOT NULL CHECK (proposed_price > 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (job_id, applicant_agent_id)
);

COMMENT ON TABLE applications IS 'Applications to jobs. One agent can only apply once per job.';
COMMENT ON COLUMN applications.manifest_id IS 'Skill Manifest the agent is offering for this job. Required.';
