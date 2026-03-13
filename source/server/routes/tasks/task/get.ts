import { Request, Response } from "express";
import { UnauthorizedError } from "../../../utils/errors.js";
import { getLocals, getUser } from "../../../utils/locals.js";
import { toAccessLevel } from "../../../auth/UserManager.js";
import { TaskDefinition, TaskDataPayload, TaskLogEntry } from "../../../tasks/types.js";

export interface TaskResponse<TData extends TaskDataPayload = TaskDataPayload, TReturn = any> {
  task: TaskDefinition<TData, TReturn>;
  logs: TaskLogEntry[];
}


export async function getTask(req: Request, res: Response) {
  const {
    vfs,
    taskScheduler,
    userManager,
  } = getLocals(req);
  const requester = getUser(req)!;
  const { id: idString } = req.params;
  const id = parseInt(idString);
  let task = await taskScheduler.getTask(id);

  if (requester.level !== "admin"
    && task.user_id !== requester.uid
    && (!task.scene_id
      || toAccessLevel(await userManager.getAccessRights(task.scene_id, requester.uid)) < toAccessLevel("read")
    )
  ) {
    throw new UnauthorizedError(`Read rights are required to access this task`);
  }
  const logs = await taskScheduler.getLogs(id);
  res.status(200).send({ task, logs });
}