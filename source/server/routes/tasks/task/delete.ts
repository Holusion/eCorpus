import { rm } from "node:fs/promises";

import { Request, Response } from "express";
import { getLocals } from "../../../utils/locals.js";


export async function deleteTask(req: Request, res: Response){
  //Authorization (owner, or admin ACL on the task's scene — and a 404 for a
  //missing task) was resolved by the route's policy({perms:"admin", on:"task"}).
  const { vfs, taskScheduler } = getLocals(req);
  const id = parseInt(req.params.id);

  await taskScheduler.deleteTask(id);
  await rm(vfs.getTaskWorkspace(id), {force: true, recursive: true});
  res.status(204).send();
}
