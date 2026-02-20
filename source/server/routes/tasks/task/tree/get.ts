import { Request, Response } from "express";
import { UnauthorizedError } from "../../../../utils/errors.js";
import { getLocals, getUser } from "../../../../utils/locals.js";
import { toAccessLevel } from "../../../../auth/UserManager.js";
import { TaskDataPayload, TaskLogEntry, TaskNode } from "../../../../tasks/types.js";

export interface TaskTreeResponse<TData extends TaskDataPayload = TaskDataPayload, TReturn = any>{
  task: TaskNode<TData, TReturn>;
  logs: TaskLogEntry[];
}


export async function getTaskTree(req: Request, res: Response){
  const {
    taskScheduler,
    userManager,
  } = getLocals(req);
  const requester = getUser(req)!;
  const {id: idString} = req.params;
  const id = parseInt(idString);

  const {root, logs} = await taskScheduler.getTaskTree(id);

  if(requester.level !== "admin"
    && root.user_id !== requester.uid
    && toAccessLevel(await userManager.getAccessRights(root.scene_id, requester.uid)) < toAccessLevel("read")
  ){
    throw new UnauthorizedError(`Read rights are required to access task trees`);
  }
  res.status(200).send({task: root, logs});
}
