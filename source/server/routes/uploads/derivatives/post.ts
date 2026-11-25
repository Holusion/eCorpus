import { Request, Response } from "express";

import { getLocals, getUser } from "../../../utils/locals.js";
import { BadRequestError } from "../../../utils/errors.js";
import { translateTask } from "../../../utils/i18n.js";
import { createUploadDerivatives, UploadDerivative, UploadDerivativesParams } from "../../../tasks/handlers/uploads.js";
import { getDerivativeSource, isQuality, isUsage, qualities, usages } from "./put.js";


/**
 * Make several derivatives of an upload, into the upload's scene, converting it only once.
 * The upload must have completed: its data has been sent and parsed.
 *
 * Body: `{usage = "Web3D", qualities: TDerivativeQuality[], optimize = true}`.
 * With `optimize: false`, the highest of the qualities is the model as it was uploaded: the others are still optimized.
 * A model one optimized oneself can be sent that way, even as a Thumb on its own.
 *
 * Answers `201 Created` once they are written, with the task that made them as the body.
 * Its `output` is `{derivatives: UploadDerivative[]}`, from lowest to highest quality.
 * Their file names are chosen by the server, as with `PUT /uploads/:id/derivatives/:usage/:quality`.
 */
export async function postUploadDerivatives(req: Request, res: Response){
  const { taskScheduler } = getLocals(req);
  const requester = getUser(req)!;
  const { usage = "Web3D", qualities: requested, optimize = true } = req.body ?? {};

  if(!isUsage(usage)){
    throw new BadRequestError(`Unsupported derivative usage: ${usage}. Supported usages: ${usages.join(", ")}`);
  }
  if(!Array.isArray(requested) || !requested.length){
    throw new BadRequestError(`A list of derivative qualities is required. Supported qualities: ${qualities.join(", ")}`);
  }
  const unknown = requested.filter(q => !isQuality(q));
  if(unknown.length){
    throw new BadRequestError(`Unsupported derivative qualities: ${unknown.map(q => JSON.stringify(q)).join(", ")}. Supported qualities: ${qualities.join(", ")}`);
  }
  if(typeof optimize !== "boolean"){
    throw new BadRequestError(`optimize must be a boolean. Got ${JSON.stringify(optimize)}`);
  }
  const { id, scene_id } = await getDerivativeSource(req, res);

  const task = await taskScheduler.create<UploadDerivativesParams>({
    scene_id,
    user_id: requester.uid,
    type: createUploadDerivatives.name,
    data: { upload: id, usage, qualities: requested, optimize },
  });
  await taskScheduler.runTask({ task, handler: createUploadDerivatives });
  const settled = await taskScheduler.getTask<UploadDerivativesParams, { derivatives: UploadDerivative[] }>(task.task_id);
  res.set("Content-Location", `/tasks/${task.task_id}`);
  res.status(201).send(translateTask(req, res, settled));
}
