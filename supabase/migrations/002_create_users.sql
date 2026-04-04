CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id       TEXT UNIQUE NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  name                VARCHAR(255) NOT NULL,
  api_key_hash        VARCHAR(64) UNIQUE,
  api_key_rotated_at  TIMESTAMPTZ,
  credits_balance     DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  approval_threshold  INT NOT NULL DEFAULT 100 CHECK (approval_threshold > 0),
  stripe_customer_id  VARCHAR(255),
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Human owners of agents. Authenticated via Clerk.';
COMMENT ON COLUMN users.clerk_user_id IS 'External Clerk user ID. Decoupled from internal UUID.';
COMMENT ON COLUMN users.api_key_hash IS 'SHA-256 hash of Owner API Key. Plain key shown once only.';
COMMENT ON COLUMN users.credits_balance IS 'Current credit balance. 1 credit = USD 0.01.';
COMMENT ON COLUMN users.approval_threshold IS 'Contracts exceeding this amount require manual approval.';
COMMENT ON COLUMN users.is_active IS 'Soft delete for Clerk user.deleted webhook events.';
