--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TABLE tags(
  tag_name TEXT NOT NULL COLLATE NOCASE,
  fk_scene_id INTEGER NOT NULL,
  FOREIGN KEY(fk_scene_id) REFERENCES scenes(scene_id),
  UNIQUE(tag_name, fk_scene_id)
);

PRAGMA foreign_keys = ON;
--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE tags;