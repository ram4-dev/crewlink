-- Atomic escrow: deduct credits and record hold
CREATE OR REPLACE FUNCTION hold_job_escrow(
  p_user_id UUID,
  p_job_id  UUID,
  p_amount  DECIMAL
) RETURNS void AS $$
BEGIN
  UPDATE users
    SET credits_balance = credits_balance - p_amount
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: %', p_user_id;
  END IF;

  INSERT INTO credit_transactions (user_id, job_id, amount, type, description)
  VALUES (p_user_id, p_job_id, -p_amount, 'escrow_hold',
          'Escrow hold for job ' || p_job_id::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Atomic escrow adjustment: release diff, hold new amount
CREATE OR REPLACE FUNCTION adjust_escrow(
  p_user_id   UUID,
  p_job_id    UUID,
  p_old_amount DECIMAL,
  p_new_amount DECIMAL
) RETURNS void AS $$
DECLARE
  v_diff DECIMAL := p_old_amount - p_new_amount;
BEGIN
  UPDATE users
    SET credits_balance = credits_balance + v_diff
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: %', p_user_id;
  END IF;

  -- Release the old hold (positive = credit back)
  INSERT INTO credit_transactions (user_id, job_id, amount, type, description)
  VALUES (p_user_id, p_job_id, v_diff, 'escrow_release',
          'Escrow adjustment (release) for job ' || p_job_id::TEXT);

  -- Record the new hold
  INSERT INTO credit_transactions (user_id, job_id, amount, type, description)
  VALUES (p_user_id, p_job_id, -p_new_amount, 'escrow_hold',
          'Escrow adjustment (hold) for job ' || p_job_id::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Atomic contract settlement: credit hired owner, record fee
CREATE OR REPLACE FUNCTION settle_contract(
  p_contract_id    UUID,
  p_hiring_user_id UUID,
  p_hired_user_id  UUID,
  p_amount         DECIMAL,
  p_fee            DECIMAL
) RETURNS void AS $$
DECLARE
  v_net DECIMAL := p_amount - p_fee;
BEGIN
  -- Credit hired agent's owner
  UPDATE users
    SET credits_balance = credits_balance + v_net
  WHERE id = p_hired_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HIRED_USER_NOT_FOUND: %', p_hired_user_id;
  END IF;

  -- Record payment to hired owner
  INSERT INTO credit_transactions (user_id, contract_id, amount, type, description)
  VALUES (p_hired_user_id, p_contract_id, v_net, 'payment',
          'Payment for contract ' || p_contract_id::TEXT);

  -- Record platform fee (user_id = NULL = platform income)
  INSERT INTO credit_transactions (user_id, contract_id, amount, type, description)
  VALUES (NULL, p_contract_id, p_fee, 'fee',
          'Platform fee for contract ' || p_contract_id::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Release held escrow back to user
CREATE OR REPLACE FUNCTION release_job_escrow(
  p_user_id UUID,
  p_job_id  UUID,
  p_amount  DECIMAL
) RETURNS void AS $$
BEGIN
  UPDATE users
    SET credits_balance = credits_balance + p_amount
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: %', p_user_id;
  END IF;

  INSERT INTO credit_transactions (user_id, job_id, amount, type, description)
  VALUES (p_user_id, p_job_id, p_amount, 'escrow_release',
          'Escrow released for job ' || p_job_id::TEXT);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Ledger reconciliation view: returns rows only when balance is inconsistent
CREATE VIEW ledger_reconciliation AS
SELECT
  u.id,
  u.credits_balance                    AS current_balance,
  COALESCE(SUM(ct.amount), 0)          AS sum_transactions,
  u.credits_balance - COALESCE(SUM(ct.amount), 0) AS discrepancy
FROM users u
LEFT JOIN credit_transactions ct ON ct.user_id = u.id
GROUP BY u.id, u.credits_balance
HAVING u.credits_balance != COALESCE(SUM(ct.amount), 0);

COMMENT ON VIEW ledger_reconciliation IS
  'Returns rows only when a user balance diverges from the sum of their transactions. Should always be empty.';
