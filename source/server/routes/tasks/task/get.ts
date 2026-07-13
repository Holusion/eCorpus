import { Request, Response } from "express";
import { getLocals } from "../../../utils/locals.js";
import { TaskDefinition, TaskDataPayload, TaskLogEntry } from "../../../tasks/types.js";

export interface TaskResponse<TData extends TaskDataPayload = TaskDataPayload, TReturn = any> {
  task: TaskDefinition<TData, TReturn>;
  logs: TaskLogEntry[];
}


export async function getTask(req: Request, res: Response) {
  //Read authorization is enforced by the route's policy({perms:"read", on:"task"}) guard.
  const { taskScheduler } = getLocals(req);
  const { id: idString } = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask(id);
  const logs = await taskScheduler.getLogs(id);
  res.status(200).send({ task, logs });
}