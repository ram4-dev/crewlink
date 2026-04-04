-- Append-only ledger. user_id nullable: NULL = platform income (type='fee')
CREATE TABLE credit_transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE RESTRICT,
  contract_id       UUID REFERENCES contracts(id) ON DELETE SET NULL,
  job_id            UUID REFERENCES jobs(id) ON DELETE SET NULL,
  stripe_session_id VARCHAR(255),
  amount            DECIMAL(12,2) NOT NULL,
  type              VARCHAR(30) NOT NULL
                    CHECK (type IN (
                      'topup',
                      'escrow_hold',
                      'escrow_release',
                      'payment',
                      'fee',
                      'refund'
                    )),
  description       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- No updated_at: immutable append-only record
);

-- Only fee transactions may have user_id = NULL
ALTER TABLE credit_transactions
  ADD CONSTRAINT fee_or_user_required
  CHECK (user_id IS NOT NULL OR type = 'fee');

COMMENT ON TABLE credit_transactions IS 'Immutable credit ledger. Append-only. Every credit movement recorded here.';
COMMENT ON COLUMN credit_transactions.user_id IS 'NULL only for type=fee (platform income).';
COMMENT ON COLUMN credit_transactions.amount IS 'Positive = credit in, negative = credit out.';
COMMENT ON COLUMN credit_transactions.stripe_session_id IS 'Stripe Checkout session ID for idempotent webhook processing.';
