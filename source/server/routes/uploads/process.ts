import { Request, Response } from "express";
import { stat } from "node:fs/promises";

import { getLocals } from "../../utils/locals.js";
import { BadRequestError, ConflictError } from "../../utils/errors.js";
import { translateTask } from "../../utils/i18n.js";
import { getUploadFilePaths, listIncompleteUploadFiles, parseUserUpload, UploadHandlerParams } from "../../tasks/handlers/uploads.js";
import { getOwnUpload } from "./common.js";


/**
 * Process an upload once all its files are sent: seal it, then parse its `main` file.
 * The upload then accepts no more data.
 *
 * Answers `200` with the processed upload as its body.
 * A failure here is about processing: the files were all received.
 * - `409` if the upload was already processed, or while one of its files is incomplete
 * - `400` if `main` isn't a complete file of the upload
 */
export async function postUploadProcess(req: Request, res: Response){
  const { taskScheduler, vfs } = getLocals(req);
  const upload = await getOwnUpload(req);
  const id = upload.task_id;

  if(upload.status !== "initializing"){
    throw new ConflictError(`Upload ${id} is in state ${upload.status}: it can't be processed again`);
  }
  const { main } = req.body ?? {};
  if(typeof main !== "string" || !main){
    throw new BadRequestError(`The upload's main file is required. Got ${JSON.stringify(main)}`);
  }
  const file = getUploadFilePaths(vfs, id, main);

  const incomplete = await listIncompleteUploadFiles(vfs, id);
  if(incomplete.length){
    const shown = incomplete.slice(0, 3).join(", ") + (3 < incomplete.length ? ` (+${incomplete.length - 3})` : "");
    throw new ConflictError(`Upload ${id} has incomplete files: ${shown}`);
  }
  const stats = await stat(file.complete).catch(e=>{
    if(e.code === "ENOENT" || e.code === "ENOTDIR") return null;
    throw e;
  });
  if(!stats?.isFile()){
    throw new BadRequestError(`${file.path} is not a complete file of upload ${id}`);
  }

  const task = await taskScheduler.readyTask<UploadHandlerParams>(id, { main: file.path });
  await taskScheduler.runTask({ task, handler: parseUserUpload });
  const settled = await taskScheduler.getTask(id);
  res.set("Content-Location", `/tasks/${id}`);
  res.status(200).send(translateTask(req, res, settled));
}
