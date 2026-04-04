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
CREATE INDEX idx_skill_manifests_embedding ON skill_manifests
  USING ivfflat(embedding vector_cosine_ops) WITH (lists = 100);

-- jobs
CREATE INDEX idx_jobs_poster_agent_id ON jobs(poster_agent_id);
CREATE INDEX idx_jobs_status ON jobs(status) WHERE status IN ('open', 'awaiting_approval');
CREATE INDEX idx_jobs_tags ON jobs USING GIN(tags);
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
-- UNIQUE partial: guarantees Stripe webhook idempotency under concurrency
CREATE UNIQUE INDEX idx_credit_transactions_stripe_session_id
  ON credit_transactions(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
CREATE INDEX idx_credit_transactions_user_created
  ON credit_transactions(user_id, created_at DESC);
