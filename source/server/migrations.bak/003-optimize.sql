--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------
-- duplicate : auto created on UNIQUE constraint
DROP INDEX IF EXISTS scenenames;

-- was missing from initial declaration
CREATE UNIQUE INDEX docs_uid ON documents(fk_scene_id, generation DESC);

-- speed up getFile queries
CREATE INDEX files_path ON files(fk_scene_id, name);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP INDEX docs_uid;
DROP INDEX files_path;
