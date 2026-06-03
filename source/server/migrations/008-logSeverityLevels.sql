--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- Align `log_severity` with the pino levels used by the structured logger
-- (`utils/log/logger.ts`). `log` is renamed to `info`, and `trace`/`fatal`
-- bookend the existing set so severity ordering stays meaningful for the
-- `getTaskTree(... { level })` filter in `tasks/manager.ts`.

ALTER TYPE log_severity RENAME VALUE 'log' TO 'info';
ALTER TYPE log_severity ADD VALUE 'trace' BEFORE 'debug';
ALTER TYPE log_severity ADD VALUE 'fatal' AFTER 'error';

ALTER TABLE tasks_logs ALTER COLUMN severity SET DEFAULT 'info';

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

-- Postgres has no DROP VALUE on enums, so rebuild the type with the original
-- set. Any rows holding the new-only values are coerced to the closest
-- equivalent (`trace` -> `debug`, `fatal` -> `error`) before the swap.

ALTER TABLE tasks_logs ALTER COLUMN severity DROP DEFAULT;

CREATE TYPE log_severity_old AS ENUM('debug', 'log', 'warn', 'error');

ALTER TABLE tasks_logs
  ALTER COLUMN severity TYPE log_severity_old
  USING (CASE severity::text
    WHEN 'trace' THEN 'debug'
    WHEN 'info'  THEN 'log'
    WHEN 'fatal' THEN 'error'
    ELSE severity::text
  END)::log_severity_old;

DROP TYPE log_severity;
ALTER TYPE log_severity_old RENAME TO log_severity;

ALTER TABLE tasks_logs ALTER COLUMN severity SET DEFAULT 'log';
