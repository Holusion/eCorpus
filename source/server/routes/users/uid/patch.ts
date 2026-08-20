import { Request, Response } from "express";

import { getAuthMethod, getLocals, getUser, getUserManager } from "../../../utils/locals.js";
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

  //The route's policy({scope:"account:admin", perms:"write", on:"user"}) already
  //enforced the credential (403 — account:admin is non-mintable, so only a
  //session gets here) and the self-or-admin gate (401). What remains is the
  //finer level-change rule, which a single ACL level can't express:
  //only admins change levels, and an admin can't demote themselves.
  if(!isAdmin && typeof update.level !== "undefined" && update.level !== level){
    throw new UnauthorizedError(`Only administrators can change user levels`);
  }else if(isAdmin && isTargetUid && typeof update.level !== "undefined" && update.level !== level){
    throw new UnauthorizedError(`Administrators can't demote themselves`);
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