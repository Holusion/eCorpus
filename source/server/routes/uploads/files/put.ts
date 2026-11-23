import { Request, Response } from "express";
import { mkdir, rename, stat, truncate } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

import { getVfs, getTaskScheduler } from "../../../utils/locals.js";
import { BadRequestError, ConflictError, LengthRequiredError, RangeNotSatisfiableError } from "../../../utils/errors.js";
import { getUploadFilePaths, getUploadStaging } from "../../../tasks/handlers/uploads.js";
import { inspectModelFile } from "../../../tasks/handlers/toGlb.js";
import { localize } from "../../../utils/i18n.js";
import { getLanguage } from "../../../utils/locals.js";
import { getOwnUpload, getUploadFileParam } from "../common.js";


/** File system errors of a file path that collides with another file of the upload (eg. `a` and `a/b`) */
const conflictCodes = new Set(["EISDIR", "ENOTDIR", "EEXIST", "ENOTEMPTY"]);

/**
 * Write one file of an upload, at `*path` relative to the upload's root.
 * Parent folders are created as needed.
 *
 * Files can be sent in chunks. `Content-Range: bytes <start>-<end>/<total>` gives the chunk's position,
 * and its total must be given: it's how the server knows the file is complete.
 * Without `Content-Range`, the body is the whole file.
 *
 * Answers `206` while the file is incomplete, `201` once it is complete,
 * with the offset to send next in `Upload-Offset`.
 * A file can be sent again, replacing it, until the upload is processed (`POST /uploads/:id/process`).
 * Nothing is processed here: the response's status is only about the transfer.
 *
 * A complete model's file (`.obj`, `.mtl`, `.ply`, `.gltf`, `.glb`) is inspected:
 * the `201`'s `inspection` tells which files it needs, so that the client sends them,
 * or why it can't be converted.
 * - `{requires: string[][]}`: for each file it refers to, the paths it would be found at, in order, relative to the upload's root.
 *   It is found at the first of them that is in the upload.
 *   Every texture is required, as the conversion needs them all.
 * - `{error: string}`: why it will fail to convert, translated for the request.
 * There's no `inspection` for other files, or when the server can't inspect them.
 *
 * @see {@link https://docs.cloud.google.com/storage/docs/performing-resumable-uploads?hl=fr#chunked-upload Google Cloud Storage: Chunked upload} for a similar feature
 */
export async function putUploadFile(req: Request, res: Response): Promise<void>{
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const upload = await getOwnUpload(req);
  const id = upload.task_id;
  const file = getUploadFilePaths(vfs, id, getUploadFileParam(req));

  const lengthHeader = req.get("Content-Length");
  const contentLength = lengthHeader ? parseInt(lengthHeader) : NaN;
  if(!Number.isSafeInteger(contentLength) || contentLength < 0 || lengthHeader !== contentLength.toString()){
    throw new LengthRequiredError(`A valid Content-Length header must be provided`);
  }

  if(upload.status !== "initializing"){
    throw new ConflictError(`Upload ${id} is in state ${upload.status}, which does not allow further data to be sent`);
  }

  let start = 0, total = contentLength;
  const contentRange = req.get("Content-Range");
  if(contentRange){
    const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange.trim());
    if(!range) throw new BadRequestError(`Malformed Content-Range header: expected "bytes <start>-<end>/<total>"`);
    start = parseInt(range[1]);
    const end = parseInt(range[2]);
    total = parseInt(range[3]);
    if(end < start || total <= end) throw new RangeNotSatisfiableError();
    if(contentLength !== end - start + 1) throw new BadRequestError(`a Content-Length of ${contentLength} can't satisfy a range of ${end - start +1}`);
    if(start !== 0){
      const {size: currentSize} = await stat(file.incomplete).catch(e=>{if(e.code !=="ENOENT") throw e; return {size: 0}});
      if(currentSize < start){
        res.set("Upload-Offset", currentSize.toString());
        throw new RangeNotSatisfiableError(`Missing bytes ${currentSize}-${start}`);
      }
    }
  }

  /** Name the path that collides with another file */
  const conflict = (e: any)=>{
    if(conflictCodes.has(e?.code)) throw new ConflictError(`${file.path} conflicts with another file of upload ${id}`);
    throw e;
  };

  await mkdir(path.dirname(file.incomplete), {recursive: true}).catch(conflict);
  await pipeline(
    req,
    async function* rangeLength(source){
      let len = 0;
      for await (const chunk of source){
        len += chunk.length;
        if(contentLength < len) throw new BadRequestError(`Expected a content length of ${contentLength}. Received ${len} bytes.`);
        yield chunk;
      }
      if(len < contentLength){
        throw new BadRequestError(`Expected a content length of ${contentLength}. Received ${len} bytes.`);
      }
    },
    createWriteStream(file.incomplete, {flags: start == 0? 'w':'r+', start}),
  ).catch(conflict);

  const received = start + contentLength;
  if(received < total){
    res.set("Upload-Offset", received.toString());
    res.status(206);
    res.format({
      "text/plain": ()=>{
        res.send("Partial Content");
      },
      "application/json": ()=>{
        res.send({code: 206, message: "Partial Content"});
      }
    });
    return;
  }

  //Bytes past the end may remain from an earlier, longer attempt
  await truncate(file.incomplete, total);
  //The upload may have been processed while this file was being received
  const {status} = await taskScheduler.getTask(id);
  if(status !== "initializing"){
    throw new ConflictError(`Upload ${id} is in state ${status}, which does not allow further data to be sent`);
  }
  await mkdir(path.dirname(file.complete), {recursive: true}).catch(conflict);
  await rename(file.incomplete, file.complete).catch(conflict);

  const body: {path: string, size: number, inspection?: {requires: string[][]}|{error: string}} = {path: file.path, size: total};
  //References may lead anywhere in the upload: the model it belongs to is at its root
  const inspection = await inspectModelFile(file.complete, {root: getUploadStaging(vfs, id).files, signal: AbortSignal.timeout(60_000)});
  if(inspection && "requires" in inspection){
    //Relative to the inspected file's folder, inside the upload's root
    const dir = path.posix.dirname(file.path);
    const fromRoot = (lists: string[][]) => lists
      .map(paths => paths.map(p => path.posix.join(dir, p)).filter(p => p !== ".." && !p.startsWith("../")))
      .filter(paths => paths.length);
    body.inspection = {requires: fromRoot(inspection.requires)};
  }else if(inspection){
    const filename = path.posix.basename(file.path);
    body.inspection = {error: localize("errors.upload.convertFailed", {filename, reason: inspection.reason}).translate(getLanguage(req))};
  }

  res.set("Upload-Offset", total.toString());
  res.status(201).send(body);
}
