
import { Request, Response } from "express";
import User from "../../../../../auth/User.js";
import UserManager from "../../../../../auth/UserManager.js";
import { BadRequestError } from "../../../../../utils/errors.js";
import { getUserId, getUserManager } from "../../../../../utils/locals.js";




export default async function handleDeleteUser(req :Request, res :Response){
  let userManager :UserManager = getUserManager(req);
  let uid = getUserId(req);
  let targetUid :number = parseInt(req.params.uid as string);
  if(uid == targetUid) throw new BadRequestError("a user can't delete himself");
  await userManager.removeUser(targetUid);
  res.status(204).send();
};
