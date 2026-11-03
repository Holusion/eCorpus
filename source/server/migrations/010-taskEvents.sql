--------------------------------------------------------------------------------
-- Up
--------------------------------------------------------------------------------

-- Publishes task changes on the `task_events` channel, whatever wrote them: the
-- scheduler, raw SQL (eg. `reapOrphans`), or an out-of-process worker.
-- NOTIFY is transactional: an event is delivered on commit and dropped on rollback,
-- so a client that reacts to one is guaranteed to read that state or a newer one.

-- Finds in-flight tasks when a client connects. It only ever holds those few rows.
CREATE INDEX idx_tasks_active ON tasks (task_id) WHERE status IN ('pending', 'running');

-- Clients fetch anything more through `GET /tasks/:id`, which does its own access checks:
-- `data` and `output` must stay out of the payload. They can hold sensitive values
-- (sendEmail's message bodies) and pg_notify rejects payloads above 8000 bytes.
CREATE FUNCTION notify_task_event() RETURNS TRIGGER AS $$
DECLARE
  t tasks;
BEGIN
  IF TG_OP = 'DELETE' THEN t := OLD; ELSE t := NEW; END IF;
  PERFORM pg_notify('task_events', json_build_object(
    'task_id',  t.task_id,
    'parent',   t.parent,
    -- A failing notification would fail the write to the task itself: keep this bounded.
    'type',     left(t.type, 128),
    'status',   CASE TG_OP WHEN 'DELETE' THEN 'deleted' ELSE t.status::text END,
    'scene_id', t.fk_scene_id,
    'user_id',  t.fk_user_id
  )::text);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_event_insert AFTER INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION notify_task_event();

-- Scene, owner and parent decide who may see a task and are assigned after its creation
-- (see `setTaskScene`, `setTaskParent`), so subscribers need to hear about those as well.
CREATE TRIGGER task_event_update AFTER UPDATE ON tasks
  FOR EACH ROW WHEN (
    OLD.status         IS DISTINCT FROM NEW.status
    OR OLD.fk_scene_id IS DISTINCT FROM NEW.fk_scene_id
    OR OLD.fk_user_id  IS DISTINCT FROM NEW.fk_user_id
    OR OLD.parent      IS DISTINCT FROM NEW.parent
  ) EXECUTE FUNCTION notify_task_event();

-- Terminal rows stay silent: nobody is waiting on them, and it keeps the retention sweep
-- (`cleanOldTasks`) from flooding the channel.
CREATE TRIGGER task_event_delete AFTER DELETE ON tasks
  FOR EACH ROW WHEN (OLD.status NOT IN ('success', 'error'))
  EXECUTE FUNCTION notify_task_event();


-- Messages for a user, kept until they're read. Tasks are one possible subject.

-- Whether a task should end up as a notification for its owner, as decided by what started it:
--   no:      the default.
--   awaited: yes, unless the HTTP response waiting on it delivers the outcome.
--   yes:     when it settles.
CREATE TYPE task_notify AS ENUM ('no', 'awaited', 'yes');
ALTER TABLE tasks ADD COLUMN notify task_notify NOT NULL DEFAULT 'no';

CREATE TABLE notifications (
  notification_id BIGSERIAL PRIMARY KEY,
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  fk_task_id BIGINT REFERENCES tasks(task_id) ON DELETE CASCADE,
  fk_scene_id BIGINT REFERENCES scenes(scene_id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ctime TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_unread ON notifications (fk_user_id, notification_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX idx_notifications_task ON notifications (fk_task_id, fk_user_id) WHERE fk_task_id IS NOT NULL;

CREATE FUNCTION create_task_notification() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications(fk_user_id, type, fk_task_id)
  VALUES (NEW.fk_user_id, 'task', NEW.task_id)
  ON CONFLICT (fk_task_id, fk_user_id) WHERE fk_task_id IS NOT NULL DO NOTHING;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

-- Settling and being told that nobody's waiting anymore can come in any order.
CREATE TRIGGER task_notification AFTER UPDATE ON tasks
  FOR EACH ROW WHEN (
    NEW.notify = 'yes' AND NEW.parent IS NULL AND NEW.fk_user_id IS NOT NULL
    AND NEW.status IN ('success', 'error')
    AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.notify <> 'yes')
  ) EXECUTE FUNCTION create_task_notification();

-- Only a signal. Its text depends on the language of whoever reads it.
CREATE FUNCTION publish_notification() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('notifications', json_build_object(
    'notification_id', NEW.notification_id,
    'user_id', NEW.fk_user_id,
    'type', left(NEW.type, 64)
  )::text);
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_created AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION publish_notification();

--------------------------------------------------------------------------------
-- Down
--------------------------------------------------------------------------------

DROP TRIGGER task_notification ON tasks;
DROP FUNCTION create_task_notification();
DROP TABLE notifications;
DROP FUNCTION publish_notification();
ALTER TABLE tasks DROP COLUMN notify;
DROP TYPE task_notify;

DROP TRIGGER task_event_delete ON tasks;
DROP TRIGGER task_event_update ON tasks;
DROP TRIGGER task_event_insert ON tasks;
DROP FUNCTION notify_task_event();
DROP INDEX idx_tasks_active;
