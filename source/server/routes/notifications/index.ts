import express, { Request, Response, Router } from "express";

import { StoredNotification } from "../../auth/UserManager.js";
import { BadRequestError } from "../../utils/errors.js";
import { i18n } from "../../utils/i18n.js";
import { getLanguage, getUser, getUserManager, policy } from "../../utils/locals.js";
import { qsToInt } from "../../utils/query.js";

const router = Router();

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
 * Lists the requester's notifications, newest first.
 * There is no way to read those of someone else, even for an admin.
 */
async function getNotifications(req: Request, res: Response){
  const {status = "unread"} = req.query;
  if(status !== "unread" && status !== "all") throw new BadRequestError(`Invalid status: ${status}`);
  const limit = qsToInt(req.query.limit) ?? 20;
  const offset = qsToInt(req.query.offset) ?? 0;
  if(!Number.isInteger(limit) || limit < 1 || 100 < limit) throw new BadRequestError(`When provided, limit must be between 1 and 100`);
  if(!Number.isInteger(offset) || offset < 0) throw new BadRequestError(`When provided, offset must be a positive integer`);

  const notifications = await getUserManager(req).getNotifications(getUser(req)!.uid, {unreadOnly: status === "unread", limit, offset});
  const lng = getLanguage(req);
  res.vary("Accept-Language");
  res.set("Content-Language", lng);
  res.set("Cache-Control", "no-cache, private");
  res.status(200).send(notifications.map(n=> ({
    notification_id: n.notification_id,
    type: n.type,
    ctime: n.ctime,
    read_at: n.read_at,
    message: messageOf(n, lng),
    link: n.task ? `/ui/tasks/${n.task.task_id}` : null,
    task: n.task,
    scene: n.scene,
  })));
}

function isId(id: unknown): id is number{
  return Number.isSafeInteger(id) && 0 < (id as number);
}

/**
 * Marks the requester's notifications as read: either a list of them, or everything up to a given ID.
 * `up_to` is what "mark all" should use, with the newest ID it has displayed:
 * it won't swallow a notification that arrived since then.
 */
async function markAsRead(req: Request, res: Response){
  const {ids, up_to} = req.body;
  if((ids === undefined) === (up_to === undefined)) throw new BadRequestError(`Expected one of ids or up_to`);
  if(ids !== undefined && !(Array.isArray(ids) && ids.length <= 1000 && ids.every(isId))) throw new BadRequestError(`Invalid list of ids`);
  if(up_to !== undefined && !isId(up_to)) throw new BadRequestError(`Invalid up_to`);
  const read = await getUserManager(req).markNotificationsRead(getUser(req)!.uid, ids ? {ids} : {upTo: up_to});
  res.status(200).send({read});
}

//Not only about tasks, so this follows the family of what belongs to a user's account.
router.get("/", policy({ scope: "account:read" }), getNotifications);
router.post("/read", policy({ scope: "account:write" }), express.json(), markAsRead);

export default router;
