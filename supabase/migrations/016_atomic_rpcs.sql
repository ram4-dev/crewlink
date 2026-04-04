-- Migration 016: Atomic RPCs for financial operations
-- Replaces the non-atomic multi-step patterns in application code.
-- Each function runs entirely within a single Postgres transaction (SECURITY DEFINER).
-- The application layer handles auth, validation, and error mapping.

-- F1: create_job_with_escrow
-- Atomically: acquires row lock on user, validates balance, inserts job,
-- debits balance, records escrow_hold. Returns the full job row as JSONB.
CREATE OR REPLACE FUNCTION create_job_with_escrow(
  p_poster_agent_id        UUID,
  p_owner_user_id          UUID,
  p_title                  TEXT,
  p_description            TEXT,
  p_budget_credits         DECIMAL,
  p_deadline               TIMESTAMPTZ DEFAULT NULL,
  p_tags                   TEXT[]      DEFAULT '{}',
  p_required_input_schema  JSONB       DEFAULT NULL,
  p_expected_output_schema JSONB       DEFAULT NULL,
  p_depth_level            INT         DEFAULT 1,
  p_parent_contract_id     UUID        DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_balance DECIMAL;
  v_job_id  UUID;
BEGIN
  -- Lock the user row to prevent concurrent overdraft
  SELECT credits_balance INTO v_balance
  FROM users
  WHERE id = p_owner_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND';
  END IF;

  IF v_balance < p_budget_credits THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS: available=%, required=%', v_balance, p_budget_credits;
  END IF;

  -- Insert job
  INSERT INTO jobs (
    poster_agent_id, title, description, budget_credits, deadline,
    tags, required_input_schema, expected_output_schema,
    depth_level, parent_contract_id, status
  ) VALUES (
    p_poster_agent_id, p_title, p_description, p_budget_credits, p_deadline,
    p_tags, p_required_input_schema, p_expected_output_schema,
    p_depth_level, p_parent_contract_id, 'open'
  )
  RETURNING id INTO v_job_id;

  -- Debit balance
  UPDATE users
    SET credits_balance = credits_balance - p_budget_credits
  WHERE id = p_owner_user_id;

  -- Record escrow hold in ledger
  INSERT INTO credit_transactions (user_id, job_id, amount, type, description)
  VALUES (
    p_owner_user_id, v_job_id, -p_budget_credits, 'escrow_hold',
    'Escrow hold for job ' || v_job_id::TEXT
  );

  RETURN (SELECT to_jsonb(j) FROM jobs j WHERE j.id = v_job_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- F2: hire_application_with_adjustment
-- Atomically: re-validates job status (under lock), checks balance if diff > 0,
-- inserts contract with manifest snapshot, adjusts escrow by the difference only,
-- transitions job and application statuses.
-- Returns JSONB with contract_id and contract_status.
CREATE OR REPLACE FUNCTION hire_application_with_adjustment(
  p_job_id                 UUID,
  p_application_id         UUID,
  p_hiring_agent_id        UUID,
  p_owner_user_id          UUID,
  p_approved_price         DECIMAL,
  p_contract_status        TEXT,
  p_selected_manifest_id   UUID,
  p_selected_endpoint_url  TEXT,
  p_pricing_model_snapshot JSONB,
  p_input_schema_snapshot  JSONB,
  p_output_schema_snapshot JSONB
) RETURNS JSONB AS $$
DECLARE
  v_budget_credits     DECIMAL;
  v_diff               DECIMAL;
  v_balance            DECIMAL;
  v_applicant_agent_id UUID;
  v_contract_id        UUID;
  v_job_status_new     TEXT;
BEGIN
  -- Lock job row and verify still open
  SELECT budget_credits INTO v_budget_credits
  FROM jobs
  WHERE id = p_job_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_OPEN';
  END IF;

  v_diff := p_approved_price - v_budget_credits;

  -- If approved price exceeds budget, lock and re-validate owner balance
  IF v_diff > 0 THEN
    SELECT credits_balance INTO v_balance
    FROM users
    WHERE id = p_owner_user_id
    FOR UPDATE;

    IF v_balance < v_diff THEN
      RAISE EXCEPTION 'INSUFFICIENT_CREDITS: available=%, required=%', v_balance, v_diff;
    END IF;
  END IF;

  -- Re-validate the application is still pending
  SELECT applicant_agent_id INTO v_applicant_agent_id
  FROM applications
  WHERE id = p_application_id AND job_id = p_job_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'APPLICATION_NOT_FOUND';
  END IF;

  -- Insert contract with manifest snapshot
  INSERT INTO contracts (
    job_id, hiring_agent_id, hired_agent_id,
    budget_credits, escrow_credits, platform_fee, status,
    selected_manifest_id, selected_endpoint_url,
    pricing_model_snapshot, input_schema_snapshot, output_schema_snapshot
  ) VALUES (
    p_job_id, p_hiring_agent_id, v_applicant_agent_id,
    v_budget_credits, p_approved_price, 0, p_contract_status,
    p_selected_manifest_id, p_selected_endpoint_url,
    p_pricing_model_snapshot, p_input_schema_snapshot, p_output_schema_snapshot
  )
  RETURNING id INTO v_contract_id;

  -- Adjust escrow — only the real difference
  IF v_diff > 0 THEN
    -- Price higher than budget: debit the extra
    UPDATE users SET credits_balance = credits_balance - v_diff WHERE id = p_owner_user_id;
    INSERT INTO credit_transactions (user_id, job_id, amount, type, description)
    VALUES (p_owner_user_id, p_job_id, -v_diff, 'escrow_hold',
            'Escrow adjustment (hold) for job ' || p_job_id::TEXT);
  ELSIF v_diff < 0 THEN
    -- Price lower than budget: release the surplus
    UPDATE users SET credits_balance = credits_balance + (-v_diff) WHERE id = p_owner_user_id;
    INSERT INTO credit_transactions (user_id, job_id, amount, type, description)
    VALUES (p_owner_user_id, p_job_id, (-v_diff), 'escrow_release',
            'Escrow adjustment (release) for job ' || p_job_id::TEXT);
  END IF;
  -- diff = 0: no ledger movement needed

  -- Transition job status
  v_job_status_new := CASE
    WHEN p_contract_status = 'pending_approval' THEN 'awaiting_approval'
    ELSE 'in_progress'
  END;
  UPDATE jobs SET status = v_job_status_new WHERE id = p_job_id;

  -- Accept the selected application
  UPDATE applications SET status = 'accepted' WHERE id = p_application_id;

  -- Reject all other pending applications for this job
  UPDATE applications
    SET status = 'rejected'
  WHERE job_id = p_job_id
    AND id != p_application_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'contract_id', v_contract_id,
    'contract_status', p_contract_status
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- F3: complete_contract_and_settle
-- Atomically: locks contract, validates status (with idempotency on 'completed'),
-- marks contract completed, credits hired agent's owner (net of fee),
-- records payment and fee transactions, updates job to completed,
-- increments agent's contracts_completed_count.
-- Returns 'completed' or 'already_completed'.
CREATE OR REPLACE FUNCTION complete_contract_and_settle(
  p_contract_id    UUID,
  p_hired_user_id  UUID,
  p_hired_agent_id UUID,
  p_platform_fee   DECIMAL,
  p_proof          JSONB,
  p_proof_warning  TEXT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE
  v_status         TEXT;
  v_escrow_credits DECIMAL;
  v_job_id         UUID;
  v_net            DECIMAL;
BEGIN
  -- Lock contract to prevent concurrent completions
  SELECT status, escrow_credits, job_id
  INTO v_status, v_escrow_credits, v_job_id
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND';
  END IF;

  -- Idempotent: already completed
  IF v_status = 'completed' THEN
    RETURN 'already_completed';
  END IF;

  IF v_status = 'pending_approval' THEN
    RAISE EXCEPTION 'CONTRACT_AWAITING_APPROVAL';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'CONTRACT_NOT_ACTIVE: %', v_status;
  END IF;

  v_net := v_escrow_credits - p_platform_fee;

  -- Mark contract completed
  UPDATE contracts SET
    status = 'completed',
    proof = p_proof,
    proof_validation_warning = p_proof_warning,
    platform_fee = p_platform_fee,
    completed_at = NOW()
  WHERE id = p_contract_id;

  -- Credit hired agent's owner (net of platform fee)
  UPDATE users
    SET credits_balance = credits_balance + v_net
  WHERE id = p_hired_user_id;

  -- Record payment in ledger
  INSERT INTO credit_transactions (user_id, contract_id, amount, type, description)
  VALUES (p_hired_user_id, p_contract_id, v_net, 'payment',
          'Payment for contract ' || p_contract_id::TEXT);

  -- Record platform fee (user_id = NULL = platform income)
  INSERT INTO credit_transactions (user_id, contract_id, amount, type, description)
  VALUES (NULL, p_contract_id, p_platform_fee, 'fee',
          'Platform fee for contract ' || p_contract_id::TEXT);

  -- Complete the job
  UPDATE jobs SET status = 'completed' WHERE id = v_job_id;

  -- Increment hired agent's contract completion counter
  UPDATE agents
    SET contracts_completed_count = contracts_completed_count + 1
  WHERE id = p_hired_agent_id;

  RETURN 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- F4: reject_pending_contract_and_release
-- Atomically: locks contract, verifies pending_approval status,
-- verifies ownership (hiring agent's owner = p_user_id),
-- cancels contract, releases escrow, reopens job, reactivates applications.
CREATE OR REPLACE FUNCTION reject_pending_contract_and_release(
  p_contract_id UUID,
  p_user_id     UUID
) RETURNS void AS $$
DECLARE
  v_status          TEXT;
  v_escrow_credits  DECIMAL;
  v_job_id          UUID;
  v_hiring_agent_id UUID;
  v_hiring_owner    UUID;
BEGIN
  -- Lock contract row
  SELECT status, escrow_credits, job_id, hiring_agent_id
  INTO v_status, v_escrow_credits, v_job_id, v_hiring_agent_id
  FROM contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CONTRACT_NOT_FOUND';
  END IF;

  IF v_status != 'pending_approval' THEN
    RAISE EXCEPTION 'CONTRACT_NOT_PENDING: %', v_status;
  END IF;

  -- Verify caller is the owner of the hiring agent
  SELECT owner_user_id INTO v_hiring_owner
  FROM agents
  WHERE id = v_hiring_agent_id;

  IF v_hiring_owner IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'AUTHZ_FORBIDDEN';
  END IF;

  -- Cancel contract
  UPDATE contracts SET status = 'cancelled' WHERE id = p_contract_id;

  -- Release escrow back to hiring owner
  UPDATE users
    SET credits_balance = credits_balance + v_escrow_credits
  WHERE id = p_user_id;

  -- Record release in ledger
  INSERT INTO credit_transactions (user_id, contract_id, amount, type, description)
  VALUES (p_user_id, p_contract_id, v_escrow_credits, 'escrow_release',
          'Escrow released for rejected contract ' || p_contract_id::TEXT);

  -- Reopen job
  UPDATE jobs SET status = 'open' WHERE id = v_job_id;

  -- Reactivate all rejected applications for this job
  UPDATE applications
    SET status = 'pending'
  WHERE job_id = v_job_id
    AND status = 'rejected';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- F4b: cancel_open_job_and_release
-- Atomically: locks job, validates open status and poster ownership,
-- cancels job, releases escrow, records ledger entry.
CREATE OR REPLACE FUNCTION cancel_open_job_and_release(
  p_job_id          UUID,
  p_poster_agent_id UUID,
  p_owner_user_id   UUID
) RETURNS void AS $$
DECLARE
  v_status         TEXT;
  v_poster_agent   UUID;
  v_budget_credits DECIMAL;
BEGIN
  SELECT status, poster_agent_id, budget_credits
  INTO v_status, v_poster_agent, v_budget_credits
  FROM jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOB_NOT_FOUND';
  END IF;

  IF v_poster_agent IS DISTINCT FROM p_poster_agent_id THEN
    RAISE EXCEPTION 'AUTHZ_FORBIDDEN';
  END IF;

  -- Idempotent: already cancelled
  IF v_status = 'cancelled' THEN
    RETURN;
  END IF;

  IF v_status != 'open' THEN
    RAISE EXCEPTION 'JOB_NOT_OPEN: %', v_status;
  END IF;

  -- Cancel job
  UPDATE jobs SET status = 'cancelled' WHERE id = p_job_id;

  -- Release escrow
  UPDATE users
    SET credits_balance = credits_balance + v_budget_credits
  WHERE id = p_owner_user_id;

  INSERT INTO credit_transactions (user_id, job_id, amount, type, description)
  VALUES (p_owner_user_id, p_job_id, v_budget_credits, 'escrow_release',
          'Escrow released for cancelled job ' || p_job_id::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- F5: process_stripe_topup_once
-- Atomically and idempotently: inserts topup transaction using the unique partial
-- index on stripe_session_id (ON CONFLICT DO NOTHING), then credits user balance
-- only if this is the first delivery of this event.
-- Returns TRUE if credited, FALSE if already processed.
CREATE OR REPLACE FUNCTION process_stripe_topup_once(
  p_user_id           UUID,
  p_credits_amount    DECIMAL,
  p_stripe_session_id TEXT,
  p_description       TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_inserted INT;
BEGIN
  -- Idempotent insert — the unique partial index prevents duplicates
  INSERT INTO credit_transactions (user_id, amount, type, stripe_session_id, description)
  VALUES (
    p_user_id,
    p_credits_amount,
    'topup',
    p_stripe_session_id,
    COALESCE(p_description, 'Recarga via Stripe — ' || p_credits_amount::TEXT || ' créditos')
  )
  ON CONFLICT (stripe_session_id) WHERE stripe_session_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Already processed — return idempotent response
  IF v_inserted = 0 THEN
    RETURN FALSE;
  END IF;

  -- Credit user balance atomically with the ledger insert
  UPDATE users
    SET credits_balance = credits_balance + p_credits_amount
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: %', p_user_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
