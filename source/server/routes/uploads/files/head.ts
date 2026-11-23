import { Request, Response } from "express";
import { stat } from "node:fs/promises";

import { getVfs } from "../../../utils/locals.js";
import { NotFoundError } from "../../../utils/errors.js";
import { getUploadFilePaths } from "../../../tasks/handlers/uploads.js";
import { getOwnUpload, getUploadFileParam } from "../common.js";


async function statFile(filepath: string){
  try{
    const s = await stat(filepath);
    return s.isFile() ? s : null;
  }catch(e: any){
    if(e.code === "ENOENT" || e.code === "ENOTDIR") return null;
    throw e;
  }
}

/**
 * Tell how much of an upload's file was received, to resume sending it.
 * - `Upload-Offset`: the number of bytes received, which is where to resume
 * - `Upload-Complete`: `?1` once the file is complete, `?0` while it's being received
 *
 * A file being sent again is reported as being received, even though a complete version of it exists.
 * Answers `404` when nothing was received for this path.
 *
 * Header names are those of the IETF's resumable uploads draft
 * @see {@link https://datatracker.ietf.org/doc/draft-ietf-httpbis-resumable-upload/}
 */
export async function headUploadFile(req: Request, res: Response): Promise<void>{
  const vfs = getVfs(req);
  const upload = await getOwnUpload(req);
  const file = getUploadFilePaths(vfs, upload.task_id, getUploadFileParam(req));

  res.set("Cache-Control", "no-store");
  const incomplete = await statFile(file.incomplete);
  if(incomplete){
    res.set("Upload-Offset", incomplete.size.toString());
    res.set("Upload-Complete", "?0");
    res.status(200).end();
    return;
  }
  const complete = await statFile(file.complete);
  if(complete){
    res.set("Upload-Offset", complete.size.toString());
    res.set("Upload-Complete", "?1");
    res.status(200).end();
    return;
  }
  throw new NotFoundError(`No data received for ${file.path} in upload ${upload.task_id}`);
}
