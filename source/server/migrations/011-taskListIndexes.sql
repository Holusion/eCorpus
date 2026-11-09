--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- Lists of tasks fetch what's under a task by its parent, which used to be a
-- scan of the whole table at each level of a tree.
CREATE INDEX idx_tasks_parent ON tasks(parent);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP INDEX idx_tasks_parent;
