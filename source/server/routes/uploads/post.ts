import { Request, Response } from "express";

import { assertSceneAccess, getTaskScheduler, getUser, getVfs } from "../../utils/locals.js";
import { BadRequestError } from "../../utils/errors.js";
import { parseUserUpload, UploadHandlerParams } from "../../tasks/handlers/uploads.js";


/**
 * Create an empty upload. Its files are sent through `PUT /uploads/:id/files/*path`,
 * then it is processed with `POST /uploads/:id/process`.
 * Answers `201 Created` with the upload's (still `initializing`) task.
 *
 * An upload may target a `scene` the requester can write to:
 * derivatives can then be made from it, into that scene (`PUT /uploads/:id/derivatives/:usage/:quality`).
 *
 * An upload is backed by a `parseUserUpload` task: the task id is the upload id,
 * and the task's workspace is where the files are staged.
 */
export async function postUpload(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {scene} = req.body ?? {};

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
    data: {},
    status: "initializing",
  });
  await vfs.createTaskWorkspace(task.task_id);

  res.set("Location", `/uploads/${task.task_id}`);
  res.status(201).send(task);
}
