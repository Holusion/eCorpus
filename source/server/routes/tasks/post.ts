import { Request, Response } from "express";
import { getTaskScheduler, getUser, getVfs } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";

export async function createTask(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  let {filename, size} = req.body;
  if(!filename){
    throw new BadRequestError(`No filename provided`);
  }
  if(!size || !Number.isInteger(size)){
    throw new BadRequestError(`Bad file size provided`);
  }

  const task = await taskScheduler.create({
    scene_id:null,
    user_id:requester.uid,
    type: "userUploads",
    status: "initializing",
    data: {
      size,
      filename,
    }
  });
  //Create the workspace immediately
  await vfs.createTaskWorkspace(task.task_id);
  res.status(200).send(task);
}