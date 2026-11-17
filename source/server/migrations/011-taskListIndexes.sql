--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- Lists of tasks fetch what's under a task by its parent, which used to be a
-- scan of the whole table at each level of a tree.
CREATE INDEX idx_tasks_parent ON tasks(parent);

-- Lists of tasks offer to filter by the types there are, overall or for a user
-- or a scene. Going from one type to the next through these indexes is about
-- as fast as reading one row per type, where a DISTINCT reads the whole table.
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_user_type ON tasks(fk_user_id, type);
CREATE INDEX idx_tasks_scene_type ON tasks(fk_scene_id, type);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP INDEX idx_tasks_scene_type;
DROP INDEX idx_tasks_user_type;
DROP INDEX idx_tasks_type;
DROP INDEX idx_tasks_parent;
