import { Request, Response } from "express";
import { UnauthorizedError } from "../../../utils/errors.js";
import { getLocals, getUser } from "../../../utils/locals.js";
import { toAccessLevel } from "../../../auth/UserManager.js";


export async function getTask(req: Request, res: Response){
  const {
    vfs,
    taskScheduler,
    userManager,
  } = getLocals(req);
  const requester = getUser(req)!;
  const {id:idString} = req.params;
  const id = parseInt(idString);
  let task = await taskScheduler.getTask(id);

  if(requester.level !== "admin" 
    && task.fk_user_id !== requester.uid 
    && toAccessLevel(await userManager.getAccessRights(task.fk_scene_id, requester.uid)) < toAccessLevel("read")
  ){
    throw new UnauthorizedError(`Read rights are required to delete tasks`);
  }
  res.status(200).send(task);
}