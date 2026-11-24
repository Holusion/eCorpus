import { TaskStatus } from "../tasks/types.js";

/**
 * A notification, as sent to clients. Same shape in `GET /users/:uid/activity` and in its stream.
 * @see migration 010, `notification_item()`
 */
export interface NotificationItem{
  notification_id: number;
  /** What it's about, if it's about a task. Not necessarily one of the user's own */
  task_id: number|null;
  type: string;
  /** The status of its task. NULL without a task: then it's settled from the start */
  status: TaskStatus|null;
  read: boolean;
  /** When what it tells last changed: its creation, or its task's latest change of status. Not its being read. ISO 8601 */
  mtime: string;
}

/** Someone gave a user access to a scene, or added them to a group */
export type AccessNotificationType = "addedToScene" | "addedToGroup";

/**
 * The `data` of notifications of an `AccessNotificationType`: not part of their item, it's read when they're drawn.
 * Names are as they were then. Ids are there to find it again, should it have been renamed.
 */
export interface AccessNotificationData{
  /** The username of whoever did it */
  by: string;
  /** For a scene: the access level they were given */
  access?: "read"|"write"|"admin";
  scene_id?: number;
  scene_name?: string;
  group_id?: number;
  group_name?: string;
}
