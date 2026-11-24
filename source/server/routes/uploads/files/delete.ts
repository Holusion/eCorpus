import { Request, Response } from "express";
import { rm, stat } from "node:fs/promises";

import { getVfs } from "../../../utils/locals.js";
import { ConflictError, NotFoundError } from "../../../utils/errors.js";
import { getUploadFilePaths } from "../../../tasks/handlers/uploads.js";
import { getOwnUpload, getUploadFileParam } from "../common.js";


/** Remove `filepath` if it's a file. Returns whether it was one */
async function removeFile(filepath: string): Promise<boolean>{
  try{
    if(!(await stat(filepath)).isFile()) return false;
  }catch(e: any){
    if(e.code === "ENOENT" || e.code === "ENOTDIR") return false;
    throw e;
  }
  await rm(filepath, {force: true});
  return true;
}

/**
 * Remove a file from an upload, whether it's complete or still being received,
 * until the upload is processed (`POST /uploads/:id/process`).
 * A client that sent a file it no longer wants removes it here: the conversion would find it otherwise.
 *
 * Answers `204` once it's removed, `404` when the upload has no file at this path.
 * - `409` if the upload was already processed
 */
export async function deleteUploadFile(req: Request, res: Response): Promise<void>{
  const vfs = getVfs(req);
  const upload = await getOwnUpload(req);
  const id = upload.task_id;
  if(upload.status !== "initializing"){
    throw new ConflictError(`Upload ${id} is in state ${upload.status}: its files can't be removed`);
  }
  const file = getUploadFilePaths(vfs, id, getUploadFileParam(req));
  const removed = (await Promise.all([removeFile(file.complete), removeFile(file.incomplete)])).some(r=>r);
  if(!removed) throw new NotFoundError(`Upload ${id} has no file ${file.path}`);
  res.status(204).end();
}
