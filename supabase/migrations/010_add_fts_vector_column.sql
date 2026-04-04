ALTER TABLE skill_manifests
  ADD COLUMN fts_vector TSVECTOR GENERATED ALWAYS AS
    (to_tsvector('spanish', capability_description)) STORED;

COMMENT ON COLUMN skill_manifests.fts_vector IS 'Spanish FTS vector auto-generated from capability_description.';
