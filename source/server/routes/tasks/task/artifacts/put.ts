import { apiMessage } from "../../../../utils/messages/index.js";
import { Request, Response } from "express";
import parseRange from "range-parser";
import path from "node:path";
import { stat } from "node:fs/promises";
import { getVfs, getUser, getTaskScheduler } from "../../../../utils/locals.js";
import { BadRequestError, LengthRequiredError, RangeNotSatisfiableError, UnauthorizedError } from "../../../../utils/errors.js";
import { TaskDefinition } from "../../../../tasks/types.js";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { parseUserUpload, UploadHandlerParams, ParsedUserUpload } from "../../../../tasks/handlers/uploads.js";

export function isUploadTask(t:TaskDefinition<any>) : t is TaskDefinition<UploadHandlerParams, ParsedUserUpload>{
  return t.type === parseUserUpload.name;
}

/**
 * File upload handler
 * Files can be sent in chunks. Uses `Content-Range` for the client to communicate chunk position
 * and responds with a `Range` header to confirm current state.
 * 
 * @see {@link https://docs.cloud.google.com/storage/docs/performing-resumable-uploads?hl=fr#chunked-upload Google Cloud Storage: Chunked upload} for a similar feature
 */
export async function putTaskArtifact(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {id:idString} = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask(id);
  if(task.user_id !== requester.uid){
    throw new UnauthorizedError(apiMessage("errors.this-task-does-not-belong-to-this-user"));
  }
  if(!isUploadTask(task)){
    throw new BadRequestError(apiMessage("errors.task-is-not-a-user-upload-task", { value1: String(id) }));
  }else if(!(typeof task.data?.filename === "string" && typeof task.data?.size === "number")){
    throw new BadRequestError(apiMessage("errors.invalid-task-data", { value1: String(typeof task.data), value2: String(JSON.stringify(task.data)) }));
  }

  const {filename, size: filesize} = task.data;
  const contentRange = req.get("Content-Range");

  const contentLength = parseInt(req.get("Content-Length")!);
  if(!contentLength || !Number.isInteger(contentLength)) throw new LengthRequiredError(apiMessage("errors.a-valid-content-length-header-must-be-provided"));

  if(task.status !== "initializing"){
    throw new BadRequestError(apiMessage("errors.task-is-in-state-which-does-not-allow-further-data-to-be-sent", { value1: String(id), value2: String(task.status) }));
  }


  //Call this once the upload has completed
  async function processUpload(){
    await taskScheduler.runTask({ task, immediate: true, handler: parseUserUpload as any });
  }

  const filepath = path.join(vfs.getTaskWorkspace(task.task_id), filename);

  if(!contentRange){
    const ws = createWriteStream(filepath)
    await pipeline(
      req,
      ws
    );
    await processUpload();
    res.status(201);
    return   res.format({
      "text/plain": ()=>{
        res.send("Created")
      },
      "application/json": ()=>{
        res.send({code: 201, message: "Created"})
      }
    });
  }
  const ranges = parseRange(filesize, contentRange.replace("bytes ", "bytes="));
  if(ranges == -1 ) throw new RangeNotSatisfiableError();
  else if(ranges == -2 || !Array.isArray(ranges) || ranges.length != 1 || ranges.type !== "bytes") throw new BadRequestError(apiMessage("errors.malformed-range-header"));
  
  const { start, end} = ranges[0];


  if(contentLength !== end - start + 1) throw new BadRequestError(apiMessage("errors.a-content-length-of-can-t-satisfy-a-range-of", { value1: String(contentLength), value2: String(end - start +1) }));
  
  // @fixme check current file size
  if(start !== 0){
    const {size: currentSize} = await stat(filepath).catch(e=>{if(e.code !=="ENOENT") throw e; return {size: 0}});
    if(currentSize < start){
      //Slightly non-standard use of the Range header to communicate what is the current file size
      res.set("Range", `bytes=0-${currentSize}/${filesize}`);
      throw new RangeNotSatisfiableError(apiMessage("errors.missing-bytes", { value1: String(currentSize), value2: String(start) }));
    }
  }
  const ws = createWriteStream(filepath, {flags: start == 0? 'w':'r+', start});
  await pipeline(
    req,
    async function* rangeLength(source){
      let len = 0;
      for await (const chunk of source){
        len += chunk.length;
        if(contentLength < len) throw new BadRequestError(apiMessage("errors.expected-a-content-length-of-received-bytes", { value1: String(contentLength), value2: String(len) }));
        yield chunk;
      }
      if(len < contentLength){
        throw new BadRequestError(apiMessage("errors.expected-a-content-length-of-received-bytes", { value1: String(contentLength), value2: String(len) }));
      }
    },
    ws
  );

  res.set("Range", `bytes=0-${end}/${filesize}`);

  if(end == filesize - 1){
    //Upload is complete
    await processUpload();
    res.status(201);
    res.format({
      "text/plain": ()=>{
        res.send("Created")
      },
      "application/json": ()=>{
        res.send({code: 201, message: "Created"})
      }
    });
  }else{
    //Partial Content
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
}
