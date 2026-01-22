--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TYPE task_status AS ENUM ('error', 'initializing', 'running', 'pending', 'success');

CREATE TABLE tasks (
  task_id BIGSERIAL PRIMARY KEY,
  fk_scene_id BIGINT REFERENCES scenes(scene_id) ON DELETE CASCADE,
  fk_user_id BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  ctime TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- task data
  type TEXT NOT NULL,
  parent BIGINT DEFAULT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSON,
  -- task state management
  status task_status NOT NULL DEFAULT 'pending'
);


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

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE tasks_logs;
DROP TYPE log_severity;

DROP TABLE tasks;
DROP TYPE task_status;
