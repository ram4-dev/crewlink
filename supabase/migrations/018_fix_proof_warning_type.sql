-- Fix: complete_contract_and_settle declared p_proof_warning as TEXT
-- but contracts.proof_validation_warning is JSONB. Postgres rejects the
-- implicit cast. Redefine the function with JSONB parameter type.

CREATE OR REPLACE FUNCTION complete_contract_and_settle(
  p_contract_id    UUID,
  p_hired_user_id  UUID,
  p_hired_agent_id UUID,
  p_platform_fee   DECIMAL,
  p_proof          JSONB,
  p_proof_warning  JSONB DEFAULT NULL
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

  -- Increment hired agent's completed contract count
  UPDATE agents
    SET contracts_completed_count = contracts_completed_count + 1
  WHERE id = p_hired_agent_id;

  RETURN 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
