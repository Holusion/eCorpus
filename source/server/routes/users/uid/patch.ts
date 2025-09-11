import { Request, Response } from "express";

import { getLocals, getUser, getUserManager } from "../../../utils/locals.js";
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

  if(!isAdmin && typeof update.level !== "undefined" && update.level !== level){
    throw new UnauthorizedError(`Only administrators can change user levels`);
  }else if(isAdmin && isTargetUid && typeof update.level !== "undefined" && update.level !== level){
    throw new UnauthorizedError(`Administrators can't demote themselves`);
  }else if(!isAdmin && !isTargetUid){
    throw new UnauthorizedError(`Can't change user ${uidString}`);
  }

  let u = await userManager.patchUser(targetUid, update);
  if(isTargetUid){
    Object.assign(
      req.session as SafeUser,
      {expires: Date.now() + sessionMaxAge},
      User.safe(u)
    );
  }
  res.status(200).send(User.safe(u));
}