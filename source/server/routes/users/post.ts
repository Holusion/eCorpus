
import { Request, Response } from "express";

import { getUserManager } from "../../utils/locals.js";
import User, { isUserRole, UserRoles } from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { BadRequestError } from "../../utils/errors.js";




export default async function postUser(req :Request, res :Response){
  let userManager :UserManager = getUserManager(req);
  let {username, password, email, level = "create"} = req.body;
  if(!username) throw new BadRequestError("username not provided");
  if(!password) throw new BadRequestError("password not provided");
  if(!isUserRole(level)) throw new BadRequestError("bad value for user level");
  if(!email) throw new BadRequestError("email not provided");
  let u = await userManager.addUser(username, password, level, email);
  res.format({
    "application/json": ()=>{
      res.status(201).send(User.safe(u));
    },
    "text/html": ()=>{
      if(req.get("referrer")){
        let referrer = new URL(req.get("referrer")!);
        if(referrer.pathname === "/ui/admin/users"){
          return res.redirect(303, referrer.toString());
        }
      }
        
      return res.status(201).send(`Created user ${u.username} <${u.email}>: ${u.level}`);

    },
    default: ()=>{
      return res.status(201).send(`Created user ${u.username} <${u.email}>: ${u.level}`)
    }
  });
};
