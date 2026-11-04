import { Request } from "express";

import { StoredNotification } from "../../auth/UserManager.js";
import { BadRequestError } from "../../utils/errors.js";
import { i18n } from "../../utils/i18n.js";
import { getLanguage, getUser, getUserManager } from "../../utils/locals.js";
import { qsToInt } from "../../utils/query.js";

/** Most specific message first. A kind of notification that nobody wrote a message for still gets one. */
function messageOf(notification: StoredNotification, lng: string): string{
  const {type, task, scene, requested_scene} = notification;
  const keys = task
    ? [`notifications.task.${task.type}.${task.status}`, `notifications.task.default.${task.status}`]
    : [`notifications.${type}`, "notifications.default"];
  const key = keys.find(k=> i18n.exists(k, {lng})) ?? keys[keys.length - 1];
  //A failed task's scene might be gone, or might never have existed
  return i18n.t(key, {lng, scene: scene ?? requested_scene ?? "?", type: task?.type ?? type});
}

/**
 * The requester's notifications, newest first and in their language, as requested by the query string.
 * There is no way to read those of someone else, even for an admin.
 */
export async function listNotifications(req: Request, defaultStatus: "unread"|"all"){
  const {status = defaultStatus} = req.query;
  if(status !== "unread" && status !== "all") throw new BadRequestError(`Invalid status: ${status}`);
  const limit = qsToInt(req.query.limit) ?? 20;
  const offset = qsToInt(req.query.offset) ?? 0;
  if(!Number.isInteger(limit) || limit < 1 || 100 < limit) throw new BadRequestError(`When provided, limit must be between 1 and 100`);
  if(!Number.isInteger(offset) || offset < 0) throw new BadRequestError(`When provided, offset must be a positive integer`);

  const stored = await getUserManager(req).getNotifications(getUser(req)!.uid, {unreadOnly: status === "unread", limit, offset});
  const lng = getLanguage(req);
  const notifications = stored.map(n=> ({
    notification_id: n.notification_id,
    type: n.type,
    ctime: n.ctime,
    read_at: n.read_at,
    message: messageOf(n, lng),
    link: n.task ? `/ui/tasks/${n.task.task_id}` : null,
    task: n.task,
    scene: n.scene,
  }));
  return {notifications, status, limit, offset};
}
