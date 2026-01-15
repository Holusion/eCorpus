import { Request, Response } from "express";
import { getVfs, getUser, getTaskScheduler } from "../../../utils/locals.js";
import { MethodNotAllowedError, NotImplementedError, UnauthorizedError } from "../../../utils/errors.js";

import { isUploadTask } from "./put.js";
import path from "node:path";



export async function getUploadTask(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {id:idString} = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask(id);
  if(task.fk_user_id !== requester.uid){
    throw new UnauthorizedError(`This task does not belong to this user`);
  }
  if(!isUploadTask(task)){
    throw new NotImplementedError(`Artifacts download not yet supported for this task`);
  }
  if(task.status == "initializing"){
    throw new MethodNotAllowedError(`GET not allowed on artifacts that are not yet complete`);
  }
  const {filename, size} = task.data;
  res.sendFile(path.join(vfs.getTaskWorkspace(task.task_id), filename));
}