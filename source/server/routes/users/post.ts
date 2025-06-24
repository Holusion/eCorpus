
import { Request, Response } from "express";

import { getUserManager } from "../../utils/locals.js";
import User, { isUserRole, UserRoles } from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { BadRequestError } from "../../utils/errors.js";




export default async function postUser(req :Request, res :Response){
  let userManager :UserManager = getUserManager(req);
  //istanbul ignore if
  if(!userManager) throw new Error("Badly configured app : userManager is not defined in app.locals");
  let {username, password, email, level = "create"} = req.body;
  if(!username) throw new BadRequestError("username not provided");
  if(!password) throw new BadRequestError("password not provided");
  if(!isUserRole(level)) throw new BadRequestError("bad value for user level");
  if(!email) throw new BadRequestError("email not provided");
  let u = await userManager.addUser(username, password, level, email);
  res.status(201).send(User.safe(u));
};
