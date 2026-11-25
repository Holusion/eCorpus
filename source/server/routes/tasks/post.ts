import { Request, Response } from "express";
import { getLocals, getTaskScheduler, getUser } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";
import { TaskHandler } from "../../tasks/types.js";
import { prefers } from "../../utils/prefer.js";


import { createSceneFromFiles, delayTask, extractScenesArchives } from "../../tasks/handlers/index.js";
import { createLogger } from "../../utils/log/index.js";

const log = createLogger("http:tasks");

/**
 * Task types a user may create through this route.
 * Other handlers (email, maintenance…) are internal and must never be reachable from here:
 * add to this list only handlers that are safe to run with arbitrary user-provided data.
 */
const userTasks = {
  createSceneFromFiles,
  extractScenesArchives,
  delayTask,
} as const;

type UserTaskType = keyof typeof userTasks;

function isUserTaskType(t: unknown): t is UserTaskType{
  return typeof t === "string" && Object.hasOwn(userTasks, t);
}

/**
 * Create a task. It starts at once and answers one of:
 *   - `202 Accepted` after creation if `Prefer: respond-async` was specified
 *   - `200 OK` after completion in all other cases
 * Clients don't choose the initial status. `status: "pending"` is accepted for compatibility.
 *
 * Uploads are not created here: see `POST /uploads`.
 */
export async function createUserTask(req: Request, res: Response){
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {type, data, status: requestedStatus} = req.body;
  if(!type || typeof type !=="string"){
    throw new BadRequestError(`No task type provided`);
  }else if(!isUserTaskType(type) ){
    throw new BadRequestError(`Unsupported task type: ${type}`);
  }

  const handler = userTasks[type] as TaskHandler;

  const status = "pending";
  if(typeof requestedStatus !== "undefined" && requestedStatus !== status){
    throw new BadRequestError(`Tasks are created with status ${status}, not ${requestedStatus}. Status can be omitted.`);
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

  const location = `/tasks/${task.task_id}`;

  if(prefers(req, "respond-async")){
    //Before it starts: the task can't settle unnoticed
    await getLocals(req).notifications.notify(task);
    //The outcome is recorded on the task and reaches the requester as a notification
    taskScheduler.runTask({task, handler})
    .catch(err => log.debug({task_id: task.task_id, err}, `Task #${task.task_id} (${task.type}) failed (User has been notified)`));

    res.set("Location", location);
    //Where the notification about it can be followed
    res.set("Link", `</users/${requester.uid}/activity>; rel="monitor"`);
    res.set("Preference-Applied", "respond-async");
    res.status(202).send(task);
  }else{
    await taskScheduler.runTask({task, handler});
    //We could just refresh task.output from the result of runTask and task.status
    //But it's safer to just fetch the whole task again
    const settled = await taskScheduler.getTask(task.task_id);
    //The body is the task found at this location
    res.set("Content-Location", location);
    res.status(200).send(settled);
  }
}
