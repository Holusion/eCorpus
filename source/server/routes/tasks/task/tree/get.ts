import { Request, Response } from "express";
import { getLocals } from "../../../../utils/locals.js";
import { TaskDataPayload, TaskLogEntry, TaskNode } from "../../../../tasks/types.js";

export interface TaskTreeResponse<TData extends TaskDataPayload = TaskDataPayload, TReturn = any> {
  task: TaskNode<TData, TReturn>;
  logs: TaskLogEntry[];
}


export async function getTaskTree(req: Request, res: Response) {
  //Read authorization (owner, or read ACL on the task's scene) was resolved
  //by the route's policy({perms:"read", on:"task"}).
  const { taskScheduler } = getLocals(req);
  const id = parseInt(req.params.id);

  const { root, logs } = await taskScheduler.getTaskTree(id);
  res.status(200).send({ task: root, logs });
}
