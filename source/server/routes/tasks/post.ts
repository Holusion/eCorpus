import { Request, Response } from "express";
import { getTaskScheduler, getUser, getVfs } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";

import { createSceneFromFiles, delayTask, extractScenesArchives, parseUserUpload } from "../../tasks/handlers/index.js";

/**
 * Task types a user may create through this route.
 * Other handlers (email, maintenance…) are internal and must never be reachable from here:
 * add to this list only handlers that are safe to run with arbitrary user-provided data.
 */
const userTasks = {
  createSceneFromFiles,
  extractScenesArchives,
  parseUserUpload,
  delayTask,
} as const;

function isUserTaskType(t: unknown): t is keyof typeof userTasks{
  return typeof t === "string" && Object.hasOwn(userTasks, t);
}


/**
 * 
 */
export async function createUserTask(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  let {type, data, status = "pending"} = req.body;
  if(!type || typeof type !=="string"){
    throw new BadRequestError(`No task type provided`);
  }else if(!isUserTaskType(type) ){
    throw new BadRequestError(`Unsupported task type: ${type}`);
  }else if(["initializing", "pending"].indexOf(status)=== -1){
    throw new BadRequestError(`Invalid task status: ${status}`);
  }
  //We perform **NO** data validation here, which might be a security hole
  //especially if task handlers can't be relied-upon to check their own data
  let task = await taskScheduler.create({
    scene_id:null,
    user_id:requester.uid,
    type,
    data,
    status,
  });


  if(status == "pending"){
    await taskScheduler.runTask({task, handler: userTasks[type] as any});
    //We could just refresh task.output from the result of runTask and task.status
    //But it's safer to just fetch the whole task again
    task = await taskScheduler.getTask(task.task_id);
  }else{
    //Create the workspace immediately
    await vfs.createTaskWorkspace(task.task_id);
  }

  res.status(201).send(task);
}
