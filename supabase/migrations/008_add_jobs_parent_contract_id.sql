ALTER TABLE jobs
  ADD COLUMN parent_contract_id UUID REFERENCES contracts(id) ON DELETE SET NULL;

COMMENT ON COLUMN jobs.parent_contract_id IS 'Parent contract from which this job derives (anti-recursion tracking).';
