import { Request, Response } from "express";
import { stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import { getVfs, getUser, getTaskScheduler } from "../../utils/locals.js";
import { BadRequestError, ConflictError, LengthRequiredError, NotFoundError, RangeNotSatisfiableError, UnauthorizedError } from "../../utils/errors.js";
import { translateTask } from "../../utils/i18n.js";
import { TaskDefinition } from "../../tasks/types.js";
import { parseUserUpload, UploadHandlerParams, ParsedUserUpload } from "../../tasks/handlers/uploads.js";

export function isUploadTask(t:TaskDefinition<any>) : t is TaskDefinition<UploadHandlerParams, ParsedUserUpload>{
  return t.type === parseUserUpload.name;
}

/**
 * Write an upload's data.
 * Files can be sent in chunks. Uses `Content-Range` for the client to communicate chunk position
 * and responds with a `Range` header to confirm current state.
 *
 * The upload is processed once its last byte is received:
 * the response is then `201 Created`, with the processed upload as its body.
 *
 * @see {@link https://docs.cloud.google.com/storage/docs/performing-resumable-uploads?hl=fr#chunked-upload Google Cloud Storage: Chunked upload} for a similar feature
 */
export async function putUpload(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const id = parseInt(req.params.id);
  const task = await taskScheduler.getTask(id);
  if(!isUploadTask(task)){
    throw new NotFoundError(`No upload with id ${id}`);
  }
  if(task.user_id !== requester.uid){
    throw new UnauthorizedError(`This upload does not belong to this user`);
  }
  if(!(typeof task.data?.filename === "string" && typeof task.data?.size === "number")){
    throw new BadRequestError(`Invalid upload data: ${typeof task.data} ${JSON.stringify(task.data)}`);
  }

  const {filename, size: filesize} = task.data;
  const contentRange = req.get("Content-Range");

  const contentLength = parseInt(req.get("Content-Length")!);
  if(!contentLength || !Number.isInteger(contentLength)) throw new LengthRequiredError(`A valid Content-Length header must be provided`);

  if(task.status !== "initializing"){
    throw new ConflictError(`Upload ${id} is in state ${task.status}, which does not allow further data to be sent`);
  }

  /** Process the completed upload and send the result */
  async function processUpload(){
    await taskScheduler.runTask({ task, immediate: true, handler: parseUserUpload as any });
    const settled = await taskScheduler.getTask(id);
    res.set("Content-Location", `/tasks/${id}`);
    res.status(201).send(translateTask(req, res, settled));
  }

  const filepath = vfs.getTaskFilePath(task.task_id, filename);

  if(!contentRange){
    await pipeline(req, createWriteStream(filepath));
    return await processUpload();
  }

  const range = /^bytes (\d+)-(\d+)\/(?:\d+|\*)$/.exec(contentRange.trim());
  if(!range) throw new BadRequestError(`Malformed Content-Range header`);
  const start = parseInt(range[1]), end = parseInt(range[2]);
  if(end < start || filesize <= end) throw new RangeNotSatisfiableError();

  if(contentLength !== end - start + 1) throw new BadRequestError(`a Content-Length of ${contentLength} can't satisfy a range of ${end - start +1}`);

  if(start !== 0){
    const {size: currentSize} = await stat(filepath).catch(e=>{if(e.code !=="ENOENT") throw e; return {size: 0}});
    if(currentSize < start){
      //Slightly non-standard use of the Range header to communicate what is the current file size
      res.set("Range", `bytes=0-${currentSize}/${filesize}`);
      throw new RangeNotSatisfiableError(`Missing bytes ${currentSize}-${start}`);
    }
  }
  const ws = createWriteStream(filepath, {flags: start == 0? 'w':'r+', start});
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
    ws
  );

  res.set("Range", `bytes=0-${end}/${filesize}`);

  if(end == filesize - 1){
    return await processUpload();
  }
  res.status(206);
  res.format({
    "text/plain": ()=>{
      res.send("Partial Content")
    },
    "application/json": ()=>{
      res.send({code: 206, message: "Partial Content"})
    }
  });
}
