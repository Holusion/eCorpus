import { rm } from "node:fs/promises";

import { Request, Response } from "express";
import { getUser, getLocals } from "../../../utils/locals.js";
import { UnauthorizedError } from "../../../utils/errors.js";


export async function deleteTask(req: Request, res: Response){
  const {
    vfs,
    taskScheduler,
    userManager,
  } = getLocals(req);
  const requester = getUser(req)!;
  const {id:idString} = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask(id);

  if(requester.level !== "admin" 
    && task.user_id !== requester.uid 
    && (!task.scene_id
      || await userManager.getAccessRights(task.scene_id, requester.uid)) != "admin"
  ){
    throw new UnauthorizedError(`Administrative rights are required to delete tasks`);
  }

  await taskScheduler.deleteTask(id);
  await rm(vfs.getTaskWorkspace(id), {force: true, recursive: true});
  res.status(204).send();
}
