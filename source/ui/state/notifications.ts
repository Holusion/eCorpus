/**
 * Notifications as the server sends them, and what can be told of one on its own.
 * A copy of the server's types (source/server/notifications/types.ts): the UI doesn't import from the server.
 */

/** As the server sends it, from `GET /users/:uid/activity` */
export interface NotificationItem {
  notification_id: number;
  task_id: number | null;
  type: string;
  /** Its task's status, null without a task */
  status: string | null;
  read: boolean;
  /** When what it tells last changed: its creation, or its task's latest change of status. Not its being read. */
  mtime: string;
}

export interface DeletedNotification {
  notification_id: number;
  deleted: true;
}

/** "running": its task hasn't settled, it will notify. "unread": it has, or never had a task. */
export type ItemState = "running" | "unread" | "read";

export function stateOf({ status, read }: NotificationItem): ItemState {
  if (status !== null && status !== "success" && status !== "error") return "running";
  return read ? "read" : "unread";
}
