import { Request, Response } from "express";
import { getTaskScheduler, getUser, getVfs } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";

import * as handlers from "../../tasks/handlers/index.js";

function isUserTaskType(t: any): t is keyof typeof handlers{
  return typeof t === "string" && typeof (handlers as any)[t] === "function";
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
    // Fire-and-forget: respond with the task as soon as it's queued so the
    // client can begin tracking progress via /tasks/:id. Errors land on the
    // task row through the scheduler's normal error path.
    taskScheduler.runTask({task, handler: handlers[type] as any})
      .catch(e => console.error(`Task ${task.type}#${task.task_id} failed:`, e));
  }else{
    //Create the workspace immediately
    await vfs.createTaskWorkspace(task.task_id);
  }

  res.status(201).send(task);
}
