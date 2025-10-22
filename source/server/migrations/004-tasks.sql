--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TYPE task_status AS ENUM ('initializing', 'pending', 'aborting', 'running', 'success', 'error');

CREATE TABLE tasks (
  task_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  fk_scene_id BIGINT NOT NULL REFERENCES scenes(scene_id) ON DELETE CASCADE,
  fk_user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- task data
  type TEXT NOT NULL,
  parent BIGINT DEFAULT NULL REFERENCES tasks(task_id),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSON,
  -- task state management
  status task_status NOT NULL DEFAULT 'pending'
);


CREATE TABLE tasks_relations(
  source BIGINT REFERENCES tasks(task_id) ON DELETE CASCADE,
  target BIGINT REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE FUNCTION relation_has_cycle(input_source_id bigint, input_target_id bigint)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
 -- We check if a path exists from the target back to the source.
  -- A cycle exists if: target -> ... -> source.
  -- Adding (source -> target) completes the loop: source -> target -> ... -> source.
  RETURN EXISTS (
    WITH RECURSIVE dependency_chain AS (
      -- Anchor clause: Start the traversal from the task that is *being depended on* (the new target).
      -- The path array tracks all tasks from the start (input_target_id).
      SELECT
        target AS current_task_id,
        ARRAY[target] AS path
      FROM tasks_relations
      WHERE source = input_target_id -- Find the direct dependants of the new target

      UNION ALL

      -- Recursive clause: Follow the chain of dependencies.
      SELECT
        tr.target,
        dc.path || tr.target
      FROM tasks_relations tr
      JOIN dependency_chain dc ON tr.source = dc.current_task_id
      -- STOP condition to prevent infinite loops on pre-existing cycles:
      -- Check if the new target is already in the path (pre-existing cycle)
      -- or if the new source is reached.
      WHERE tr.target != ANY(dc.path)
    )
    -- Check if the target is found in the path.
    -- The final check: Is the source task reachable from the target task?
    SELECT 1 FROM dependency_chain
    WHERE current_task_id = input_source_id
  );
END;
$$;

ALTER TABLE tasks_relations 
ADD CONSTRAINT check_no_cycles CHECK (NOT relation_has_cycle(source, target));

-- create a trigger that will notify clients on every task update
CREATE OR REPLACE FUNCTION tasks_status_notify()
RETURNS trigger AS $$
BEGIN
	PERFORM pg_notify( 'tasks_' || NEW.status, NEW.task_id::text);
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_status
	AFTER INSERT OR UPDATE OF status
	ON tasks
	FOR EACH ROW
EXECUTE PROCEDURE tasks_status_notify();


CREATE TYPE log_severity AS ENUM('debug', 'log', 'warn', 'error');

CREATE TABLE tasks_logs (
  log_id BIGSERIAL PRIMARY KEY, -- ensure consistent ordering
  fk_task_id BIGINT REFERENCES tasks(task_id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  severity log_severity NOT NULL DEFAULT 'log',
  message TEXT NOT NULL
);

CREATE FUNCTION task_tree(_task_id bigint)
  RETURNS jsonb
  LANGUAGE sql STABLE PARALLEL SAFE AS
$$
SELECT jsonb_agg(sub)
FROM  (
  SELECT
    t.task_id AS task_id,
    t.type AS type,
    t.status AS status,
    t.ctime AS ctime,
    (SELECT json_agg(source) FROM tasks_relations WHERE target = t.task_id) as after,
    t.output AS output,
    COALESCE(task_tree(t.task_id), '[]'::jsonb) AS children
  FROM   tasks t
  WHERE  t.parent = _task_id
  ORDER  BY t.ctime ASC, t.task_id ASC
) AS sub
$$;

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP FUNCTION task_tree;

DROP TABLE tasks_logs;
DROP TYPE log_severity;


DROP TABLE tasks_relations;
DROP FUNCTION relation_has_cycle;

DROP TABLE tasks;
DROP TYPE task_status;
