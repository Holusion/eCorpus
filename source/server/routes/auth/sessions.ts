import { Request, Response } from "express";

import { BadRequestError, UnauthorizedError } from "../../utils/errors.js";
import { getUser, getUserManager } from "../../utils/locals.js";
import { UserSession } from "../../auth/UserManager.js";

function serializeSession(s: UserSession){
  return {
    id: s.id,
    uid: s.uid,
    created: s.created.toISOString(),
    expires: s.expires.toISOString(),
    lastSeen: s.lastSeen.toISOString(),
    userAgent: s.userAgent,
  };
}

/**
 * List the requester's own active sessions.
 * Only metadata and the management id are exposed: the credential never leaves the cookie.
 */
export async function getOwnSessions(req: Request, res: Response){
  const requester = getUser(req)!;
  const sessions = await getUserManager(req).getSessions(requester.uid);
  res.status(200).send(sessions.map(serializeSession));
}

/**
 * List any user's active sessions (admin inventory)
 */
export async function getUserSessions(req: Request, res: Response){
  const uid = parseInt(req.params.uid, 10);
  if(Number.isNaN(uid)) throw new BadRequestError(`Invalid uid: ${req.params.uid}`);
  const sessions = await getUserManager(req).getSessions(uid);
  res.status(200).send(sessions.map(serializeSession));
}

/**
 * Revoke a session by its management id. Owners can revoke their own sessions, administrators anyone's.
 */
export async function deleteSession(req: Request, res: Response){
  const requester = getUser(req);
  if(!requester?.uid) throw new UnauthorizedError();
  const id = parseInt(req.params.id, 10);
  if(Number.isNaN(id)) throw new BadRequestError(`Invalid session id: ${req.params.id}`);
  await getUserManager(req).removeSession(id, requester.level === "admin" ? undefined : requester.uid);
  res.status(204).send();
}
