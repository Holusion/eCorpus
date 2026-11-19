import { Request, Response } from "express";

import { assertSceneAccess, getTaskScheduler, getUser, getVfs } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";
import { parseUserUpload, UploadHandlerParams } from "../../tasks/handlers/uploads.js";


/**
 * Create an upload: it waits for its data, sent through `PUT /uploads/:id`.
 * Answers `201 Created` with the upload's (still `initializing`) task.
 *
 * An upload may target a `scene` the requester can write to:
 * derivatives can then be made from it, into that scene (`PUT /uploads/:id/derivatives/:usage/:quality`).
 *
 * An upload is backed by a `parseUserUpload` task: the task id is the upload id,
 * and the task's workspace is where the data is staged.
 */
export async function postUpload(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {filename, size, scene} = req.body ?? {};

  if(typeof filename !== "string" || !filename){
    throw new BadRequestError(`A file name is required`);
  }
  if(!Number.isSafeInteger(size) || size <= 0){
    throw new BadRequestError(`A file size is required, as a positive integer. Got ${JSON.stringify(size)}`);
  }
  //Validate the file name before anything gets created: it must stay inside the upload's workspace
  vfs.getTaskFilePath(0, filename);

  let scene_id: number | null = null;
  if(typeof scene !== "undefined" && scene !== null){
    if(typeof scene !== "string" || !scene){
      throw new BadRequestError(`Invalid scene name: ${JSON.stringify(scene)}`);
    }
    await assertSceneAccess(req, res, scene, "write");
    scene_id = (await vfs.getScene(scene)).id;
  }

  const task = await taskScheduler.create<UploadHandlerParams>({
    scene_id,
    user_id: requester.uid,
    type: parseUserUpload.name,
    data: {filename, size},
    status: "initializing",
  });
  await vfs.createTaskWorkspace(task.task_id);

  res.set("Location", `/uploads/${task.task_id}`);
  res.status(201).send(task);
}
