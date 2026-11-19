import { Request, Response } from "express";

import { assertSceneAccess, getLocals, getUser } from "../../../utils/locals.js";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from "../../../utils/errors.js";
import { localize, translateTask } from "../../../utils/i18n.js";
import { TDerivativeQuality, TDerivativeUsage } from "../../../utils/schema/model.js";
import { createUploadDerivative, UploadDerivative, UploadDerivativeParams } from "../../../tasks/handlers/uploads.js";
import { isUploadTask } from "../put.js";


/** Derivative usages that can be made from an upload. Others may come later */
const usages: readonly TDerivativeUsage[] = ["Web3D"];
/** Every quality has an optimization preset */
const qualities: readonly TDerivativeQuality[] = ["Thumb", "Low", "Medium", "High", "Highest", "AR"];

function isUsage(u: string): u is TDerivativeUsage {
  return (usages as readonly string[]).includes(u);
}
function isQuality(q: string): q is TDerivativeQuality {
  return (qualities as readonly string[]).includes(q);
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
  const id = parseInt(req.params.id);
  const { usage, quality } = req.params;

  const upload = await taskScheduler.getTask(id);
  if(!isUploadTask(upload)){
    throw new NotFoundError(`No upload with id ${id}`);
  }
  if(upload.user_id !== requester.uid){
    throw new UnauthorizedError(`This upload does not belong to this user`);
  }
  if(!isUsage(usage)){
    throw new BadRequestError(`Unsupported derivative usage: ${usage}. Supported usages: ${usages.join(", ")}`);
  }
  if(!isQuality(quality)){
    throw new BadRequestError(`Unsupported derivative quality: ${quality}. Supported qualities: ${qualities.join(", ")}`);
  }
  if(upload.status !== "success"){
    throw new ConflictError(`Upload ${id} is in state ${upload.status}: derivatives can only be made from a completed upload`);
  }
  if(!upload.scene_id){
    throw new BadRequestError(`Upload ${id} has no target scene: create it with a scene to make derivatives from it`);
  }
  if(!(upload.output as {isModel?: boolean}).isModel){
    throw new BadRequestError(localize("errors.upload.notAModel", { filename: upload.data.filename }));
  }
  //Access to the scene might have changed since the upload was created
  await assertSceneAccess(req, res, upload.scene_id, "write");

  const task = await taskScheduler.create<UploadDerivativeParams>({
    scene_id: upload.scene_id,
    user_id: requester.uid,
    type: createUploadDerivative.name,
    data: { upload: id, usage, quality },
  });
  await taskScheduler.runTask({ task, handler: createUploadDerivative });
  const settled = await taskScheduler.getTask<UploadDerivativeParams, UploadDerivative>(task.task_id);
  const scene = await vfs.getScene(upload.scene_id);

  res.set("Location", `/scenes/${encodeURIComponent(scene.name)}/${encodeURIComponent(settled.output.uri)}`);
  res.set("Content-Location", `/tasks/${task.task_id}`);
  res.status(201).send(translateTask(req, res, settled));
}
