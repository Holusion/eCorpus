import { Request, Response } from "express";
import { getVfs, getUser, getTaskScheduler } from "../../../../utils/locals.js";
import { MethodNotAllowedError, NotImplementedError, UnauthorizedError } from "../../../../utils/errors.js";

import { isArtifactTask } from "../../../../tasks/types.js";



export async function getTaskArtifact(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {id:idString} = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask(id);
  if(task.user_id !== requester.uid){
    throw new UnauthorizedError(`This task does not belong to this user`);
  }
  if(task.status != 'success'){
    throw new MethodNotAllowedError(`Task status is ${task.status}. GET is only allowed on tasks that have status = "success"`);
  }
  if(!isArtifactTask(task.output)){
    throw new NotImplementedError(`Artifacts download not supported for task type ${task.type}`);
  }
  res.sendFile(task.output.fileLocation, {root: vfs.baseDir});
}