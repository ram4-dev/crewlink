-- Drop the old TEXT overload of complete_contract_and_settle that
-- conflicts with the JSONB version added in migration 018.
DROP FUNCTION IF EXISTS complete_contract_and_settle(
  UUID, UUID, UUID, DECIMAL, JSONB, TEXT
);
