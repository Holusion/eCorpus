import { Request, Response } from "express";

import { assertSceneAccess, getLocals, getUser } from "../../../utils/locals.js";
import { BadRequestError, ConflictError } from "../../../utils/errors.js";
import { localize, translateTask } from "../../../utils/i18n.js";
import { TDerivativeQuality, TDerivativeUsage } from "../../../utils/schema/model.js";
import { createUploadDerivative, UploadDerivative, UploadDerivativeParams } from "../../../tasks/handlers/uploads.js";
import { getOwnUpload } from "../common.js";


/** Derivative usages that can be made from an upload. Others may come later */
export const usages: readonly TDerivativeUsage[] = ["Web3D"];
/** Every quality has an optimization preset */
export const qualities: readonly TDerivativeQuality[] = ["Thumb", "Low", "Medium", "High", "Highest", "AR"];

export function isUsage(u: unknown): u is TDerivativeUsage {
  return (usages as readonly unknown[]).includes(u);
}
export function isQuality(q: unknown): q is TDerivativeQuality {
  return (qualities as readonly unknown[]).includes(q);
}

/**
 * Get the upload derivatives are made from, if they can be made from it into its scene.
 * @throws {ConflictError} if the upload hasn't completed
 * @throws {BadRequestError} if it has no scene or isn't a model
 */
export async function getDerivativeSource(req: Request, res: Response){
  const upload = await getOwnUpload(req);
  const id = upload.task_id;
  if(upload.status !== "success"){
    throw new ConflictError(`Upload ${id} is in state ${upload.status}: derivatives can only be made from a completed upload`);
  }
  if(!upload.scene_id){
    throw new BadRequestError(`Upload ${id} has no target scene: create it with a scene to make derivatives from it`);
  }
  if(!(upload.output as {isModel?: boolean}).isModel){
    throw new BadRequestError(localize("errors.upload.notAModel", { filename: upload.data.main }));
  }
  //Access to the scene might have changed since the upload was created
  await assertSceneAccess(req, res, upload.scene_id, "write");
  return { id, scene_id: upload.scene_id };
}


/**
 * Make a derivative of an upload, into the upload's scene.
 * The upload must have completed: its data has been sent and parsed.
 *
 * Answers `201 Created` once the derivative is written, with:
 * - `Location`: the derivative's scene file
 * - the task that made it as the body. Its `output` is an {@link UploadDerivative}
 *
 * The derivative's file name is chosen by the server, and is the same each time:
 * making a derivative again writes a new version of the same file.
 */
export async function putUploadDerivative(req: Request, res: Response){
  const { taskScheduler, vfs } = getLocals(req);
  const requester = getUser(req)!;
  const { usage, quality } = req.params;

  if(!isUsage(usage)){
    throw new BadRequestError(`Unsupported derivative usage: ${usage}. Supported usages: ${usages.join(", ")}`);
  }
  if(!isQuality(quality)){
    throw new BadRequestError(`Unsupported derivative quality: ${quality}. Supported qualities: ${qualities.join(", ")}`);
  }
  const { id, scene_id } = await getDerivativeSource(req, res);

  const task = await taskScheduler.create<UploadDerivativeParams>({
    scene_id,
    user_id: requester.uid,
    type: createUploadDerivative.name,
    data: { upload: id, usage, quality },
  });
  await taskScheduler.runTask({ task, handler: createUploadDerivative });
  const settled = await taskScheduler.getTask<UploadDerivativeParams, UploadDerivative>(task.task_id);
  const scene = await vfs.getScene(scene_id);

  res.set("Location", `/scenes/${encodeURIComponent(scene.name)}/${encodeURIComponent(settled.output.uri)}`);
  res.set("Content-Location", `/tasks/${task.task_id}`);
  res.status(201).send(translateTask(req, res, settled));
}
