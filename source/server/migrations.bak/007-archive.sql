
-- add an explicit "archived" field for scenes which makes filtering them out easier

--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

ALTER TABLE scenes ADD COLUMN archived INTEGER DEFAULT 0;

CREATE INDEX archived_scenes ON scenes(scene_id, archived);

UPDATE scenes 
SET archived = TRUE
WHERE scene_name LIKE "%#" || CAST(scene_id AS TEXT);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP INDEX archived_scenes;
ALTER TABLE scenes DROP COLUMN archived;