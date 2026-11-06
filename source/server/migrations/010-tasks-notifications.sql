--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- One row per notification, for one user. Optionally about a task.
-- In that case, status follows the task with running/unread/read
CREATE TABLE notifications (
  notification_id BIGSERIAL PRIMARY KEY,
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  -- Goes away with its task (retention, scene deletion).
  fk_task_id BIGINT REFERENCES tasks(task_id) ON DELETE CASCADE,
  -- Its creation, then each change of its task's status.
  mtime TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- What the notification is about, for display and, later, per-type email settings.
  -- Not necessarily the task's type: an admin may be told "cleanup_failed" about a phase.
  type TEXT NOT NULL,
  -- Details for notifications without a task. Task notifications read their task.
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Set by a client: the user marking it, or the page that displayed the outcome.
  -- The server never assumes delivery, so anything uncertain ends up notified.
  read BOOLEAN NOT NULL DEFAULT false,
  -- At most one notification per task and user. Also the lookup from a task.
  UNIQUE (fk_task_id, fk_user_id)
);

-- A user's notifications, newest first.
CREATE INDEX idx_notifications_user ON notifications (fk_user_id, mtime, notification_id);

-- Tasks that haven't settled, which notifications list first. There are only ever a few of them.
CREATE INDEX idx_tasks_unsettled ON tasks (task_id) WHERE status NOT IN ('success', 'error');


-- A notification, as sent to clients
-- Keep it to identifiers and flags: pg_notify fails above 8000 bytes, which would fail the write.
CREATE FUNCTION notification_item(n notifications) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'notification_id', n.notification_id,
    'task_id',         n.fk_task_id,
    'type',            n.type,
    'status',          (SELECT status FROM tasks WHERE task_id = n.fk_task_id),
    'read',            n.read,
    'mtime',           n.mtime
  );
$$ LANGUAGE sql STABLE;

-- The only `pg_notify`: one signal per change of a notification, addressed to its user, carrying its
-- new state, or its id and `deleted: true` once it's gone.
-- Delivered on commit, in commit order, dropped on rollback.
CREATE FUNCTION publish_notification(user_id BIGINT, item jsonb) RETURNS void AS $$
  SELECT pg_notify('notifications', json_build_object('user_id', user_id, 'item', item)::text);
$$ LANGUAGE sql;

CREATE FUNCTION notification_changed() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM publish_notification(OLD.fk_user_id, jsonb_build_object('notification_id', OLD.notification_id, 'deleted', true));
  ELSE
    PERFORM publish_notification(NEW.fk_user_id, notification_item(NEW));
  END IF;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

-- Includes notifications created already settled, eg. one per admin about a failure.
CREATE TRIGGER notification_created AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION notification_changed();

CREATE TRIGGER notification_read_changed AFTER UPDATE OF read ON notifications
  FOR EACH ROW WHEN (OLD.read IS DISTINCT FROM NEW.read)
  EXECUTE FUNCTION notification_changed();

-- Only an unread notification changes what a client shows. This keeps the retention sweep
-- (`cleanOldTasks`) from flooding the channel.
CREATE TRIGGER notification_deleted AFTER DELETE ON notifications
  FOR EACH ROW WHEN (NOT OLD.read)
  EXECUTE FUNCTION notification_changed();

-- Notifications follow their task's status, whoever writes it
-- Setting `mtime` doesn't fire `notification_read_changed`: that one is about `read` only.
CREATE FUNCTION task_status_changed() RETURNS TRIGGER AS $$
DECLARE
  n notifications;
BEGIN
  FOR n IN UPDATE notifications SET mtime = CURRENT_TIMESTAMP WHERE fk_task_id = NEW.task_id RETURNING * LOOP
    PERFORM publish_notification(n.fk_user_id, notification_item(n));
  END LOOP;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_status_changed AFTER UPDATE OF status ON tasks
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION task_status_changed();

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TRIGGER task_status_changed ON tasks;
DROP FUNCTION task_status_changed();
DROP TRIGGER notification_deleted ON notifications;
DROP TRIGGER notification_read_changed ON notifications;
DROP TRIGGER notification_created ON notifications;
DROP FUNCTION notification_changed();
DROP FUNCTION publish_notification(BIGINT, jsonb);
DROP FUNCTION notification_item(notifications);
DROP INDEX idx_tasks_unsettled;
DROP TABLE notifications;
