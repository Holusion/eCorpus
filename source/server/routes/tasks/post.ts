import { Request, Response } from "express";
import { getTaskScheduler, getUser, getVfs } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";

import { isUserHandlerType } from "../../tasks/scheduler.js";
import * as handlers from "../../tasks/handlers/index.js";

/**
 * 
 */
export async function createUserTask(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  let {type, data, status} = req.body;
  if(!type || typeof type !=="string"){
    throw new BadRequestError(`No task type provided`);
  }else if(!isUserHandlerType(type)){
    throw new BadRequestError(`Unsupported task type: ${type}`);
  }else if(["initializing", "pending"].indexOf(status)=== -1){
    throw new BadRequestError(`Invalid task status: ${status}`);
  }
  //We perform **NO** data validation here, which might be a security hole
  //especially if task handlers can't be relied-upon to check their own data
  const task = await taskScheduler.create({
    scene_id:null,
    user_id:requester.uid,
    type,
    data,
    status,
  });

  if(status == "pending"){
    await taskScheduler.runTask({task, immediate: true, handler: handlers[type] as any});
  }

  //Create the workspace immediately
  await vfs.createTaskWorkspace(task.task_id);
  res.status(200).send(task);
}
