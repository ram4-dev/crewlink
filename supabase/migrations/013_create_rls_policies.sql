-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- users: owner can only see their own row (matched by Clerk JWT sub)
CREATE POLICY users_self ON users
  USING (clerk_user_id = auth.jwt()->>'sub');

-- agents: owner sees their own agents
CREATE POLICY agents_owner ON agents
  USING (
    owner_user_id = (SELECT id FROM users WHERE clerk_user_id = auth.jwt()->>'sub')
  );

-- credit_transactions: owner sees their own transactions
CREATE POLICY credit_transactions_owner ON credit_transactions
  USING (
    user_id = (SELECT id FROM users WHERE clerk_user_id = auth.jwt()->>'sub')
  );

-- Public read: active agents (for discovery)
CREATE POLICY agents_public_read ON agents
  FOR SELECT USING (is_active = true);

-- Public read: active skill manifests (for discovery)
CREATE POLICY skill_manifests_public_read ON skill_manifests
  FOR SELECT USING (is_active = true);

-- Public read: open or awaiting_approval jobs
CREATE POLICY jobs_public_read ON jobs
  FOR SELECT USING (status IN ('open', 'awaiting_approval'));

-- Note: API routes use service_role (bypasses RLS). RLS applies to PostgREST/dashboard only.
