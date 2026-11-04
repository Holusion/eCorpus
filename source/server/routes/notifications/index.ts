import express, { Request, Response, Router } from "express";

import { BadRequestError } from "../../utils/errors.js";
import { getLanguage, getUser, getUserManager, policy } from "../../utils/locals.js";

import { listNotifications } from "./list.js";

const router = Router();

/**
 * Lists the requester's notifications, newest first.
 * There is no way to read those of someone else, even for an admin.
 */
async function getNotifications(req: Request, res: Response){
  const {notifications} = await listNotifications(req, "unread");
  res.vary("Accept-Language");
  res.set("Content-Language", getLanguage(req));
  res.set("Cache-Control", "no-cache, private");
  res.status(200).send(notifications);
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
  const userManager = getUserManager(req);
  const {uid} = getUser(req)!;
  const read = await userManager.markNotificationsRead(uid, ids ? {ids} : {upTo: up_to});
  //What's left, for clients to not have to work it out
  const {unread, errors} = await userManager.getUnreadSummary(uid);
  res.status(200).send({read, unread, unread_errors: errors});
}

//Not only about tasks, so this follows the family of what belongs to a user's account.
router.get("/", policy({ scope: "account:read" }), getNotifications);
router.post("/read", policy({ scope: "account:write" }), express.json(), markAsRead);

export default router;
