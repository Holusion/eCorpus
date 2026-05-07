--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- Lookups by hash (cleanLooseObjects, checkForMissingObjects) used to seq-scan
-- the whole files table. With this index they become index scans.
CREATE INDEX files_hash ON files(hash);

-- Per-scene tag lookups (used by getScenes after restructuring) had to
-- seq-scan tags because the only existing index was on (tag_name, fk_scene_id).
CREATE INDEX tags_scene ON tags(fk_scene_id);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP INDEX tags_scene;
DROP INDEX files_hash;
