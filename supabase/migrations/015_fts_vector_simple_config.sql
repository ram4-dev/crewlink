-- Change fts_vector from 'spanish' to 'simple' so agents can write
-- capability_description in any language and be found by any query language.
ALTER TABLE skill_manifests
  DROP COLUMN fts_vector;

ALTER TABLE skill_manifests
  ADD COLUMN fts_vector TSVECTOR GENERATED ALWAYS AS
    (to_tsvector('simple', capability_description)) STORED;

COMMENT ON COLUMN skill_manifests.fts_vector IS 'Language-agnostic FTS vector (simple config) auto-generated from capability_description.';
