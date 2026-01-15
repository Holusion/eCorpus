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

  const task = await taskScheduler.create(null, requester.uid, {type:"userUploads", status: "initializing", data: {
    size,
    filename,
  }});
  await vfs.createTaskWorkspace(task);

  res.status(200).send({
    task,
  });
}