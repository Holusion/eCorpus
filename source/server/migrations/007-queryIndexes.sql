--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- Lookups by hash (cleanLooseObjects, checkForMissingObjects) used to seq-scan
-- the whole files table. With this index they become index scans.
CREATE INDEX files_hash ON files(hash);

-- Per-scene tag lookups (used by getScenes after restructuring) had to
-- seq-scan tags because the only existing index was on (tag_name, fk_scene_id).
CREATE INDEX tags_scene ON tags(fk_scene_id);

-- Retention sweep (cleanOldTasks) deletes terminal root tasks past their
-- retention window. The partial index matches the DELETE predicate exactly.
CREATE INDEX idx_tasks_status_ctime
  ON tasks (status, ctime)
  WHERE parent IS NULL;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP INDEX idx_tasks_status_ctime;
DROP INDEX tags_scene;
DROP INDEX files_hash;
