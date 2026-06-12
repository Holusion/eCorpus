import { Request, Response } from "express";

import { getAuthMethod, getLocals, getUser, getUserManager, isFullAccess } from "../../../utils/locals.js";
import User, { SafeUser } from "../../../auth/User.js";
import { UnauthorizedError } from "../../../utils/errors.js";




export async function handlePatchUser(req:Request, res :Response){
  const {uid: uidString}= req.params;
  const update = req.body;
  const {sessionMaxAge} = getLocals(req);
  const targetUid = parseInt(uidString, 10);
  const requester = getUser(req);
  const level = requester ? requester.level : "none";
  const isAdmin = (level == "admin");
  const isTargetUid = requester? requester.uid === targetUid : false;
  const userManager = getUserManager(req);

  if(!isFullAccess(res)){
    //A restriction-scoped token must not modify accounts: changing the
    //password would escalate it back to its owner's full authority.
    throw new UnauthorizedError(`token scope does not allow account modification`);
  }

  if(!isAdmin && typeof update.level !== "undefined" && update.level !== level){
    throw new UnauthorizedError(`Only administrators can change user levels`);
  }else if(isAdmin && isTargetUid && typeof update.level !== "undefined" && update.level !== level){
    throw new UnauthorizedError(`Administrators can't demote themselves`);
  }else if(!isAdmin && !isTargetUid){
    throw new UnauthorizedError(`Can't change user ${uidString}`);
  }

  let u = await userManager.patchUser(targetUid, update);
  if(isTargetUid && typeof update.password !== "undefined" && getAuthMethod(res) === "session"){
    //Changing one's own password evicted every session (see UserManager.patchUser):
    //keep the requester logged in by minting a fresh one.
    const expires = new Date(Date.now() + sessionMaxAge);
    const {sid} = await userManager.createSession(targetUid, {expires, userAgent: req.get("User-Agent")});
    req.session = {lang: req.session?.lang, sid, expires: expires.valueOf()};
  }
  res.status(200).send(User.safe(u));
}