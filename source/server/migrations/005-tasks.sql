--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

CREATE TYPE task_status AS ENUM ('error', 'initializing', 'running', 'pending', 'success');
CREATE TYPE log_severity AS ENUM('debug', 'log', 'warn', 'error');

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


CREATE TABLE tasks_logs (
  log_id BIGSERIAL PRIMARY KEY, -- ensure consistent ordering
  fk_task_id BIGINT REFERENCES tasks(task_id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  severity log_severity NOT NULL DEFAULT 'log',
  message TEXT NOT NULL
);

-- Index to speed up lookups on logs insertion
CREATE INDEX idx_tasks_logs_fk_task_id ON tasks_logs(fk_task_id);

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TABLE tasks_logs;

DROP TABLE tasks;

DROP TYPE task_status;
DROP TYPE log_severity;
