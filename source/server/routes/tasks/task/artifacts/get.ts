import { Request, Response } from "express";
import { getVfs, getUser, getTaskScheduler } from "../../../../utils/locals.js";
import { MethodNotAllowedError, NotImplementedError, UnauthorizedError } from "../../../../utils/errors.js";

import { isUploadTask } from "./put.js";
import path from "node:path";
import { UploadHandlerParams } from "../../../../tasks/handlers/uploads.js";



export async function getTaskArtifact(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {id:idString} = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask<UploadHandlerParams>(id);
  if(task.user_id !== requester.uid){
    throw new UnauthorizedError(`This task does not belong to this user`);
  }
  if(task.status != 'success'){
    throw new MethodNotAllowedError(`Task status is ${task.status}. GET is only allowed on tasks that have status = "success"`);
  }
  if(!task.output.filepath){
    throw new NotImplementedError(`Artifacts download not supported for this task`);
  }
  const {filepath} = task.output;
  res.sendFile(filepath, {root: vfs.baseDir});
}