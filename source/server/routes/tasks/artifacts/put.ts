import { Request, Response } from "express";
import parseRange from "range-parser";
import path from "node:path";
import { stat } from "node:fs/promises";
import { getVfs, getUser, getTaskScheduler } from "../../../utils/locals.js";
import { BadRequestError, LengthRequiredError, RangeNotSatisfiableError, UnauthorizedError } from "../../../utils/errors.js";
import { TaskDefinition } from "../../../tasks/types.js";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";

export function isUploadTask(t:TaskDefinition<any>) : boolean{
  return t.type === "userUploads";
}

/**
 * File upload handler
 * Files can be sent in chunks. Uses `Content-Range` for the client to communicate chunk position
 * and responds with a `Range` header to confirm current state.
 * 
 * @see {@link https://docs.cloud.google.com/storage/docs/performing-resumable-uploads?hl=fr#chunked-upload Google Cloud Storage: Chunked upload} for a similar feature
 */
export async function putUploadTask(req: Request, res: Response){
  const vfs = getVfs(req);
  const taskScheduler = getTaskScheduler(req);
  const requester = getUser(req)!;
  const {id:idString} = req.params;
  const id = parseInt(idString);
  const task = await taskScheduler.getTask(id);
  if(task.fk_user_id !== requester.uid){
    throw new UnauthorizedError(`This task does not belong to this user`);
  }
  if(!isUploadTask(task)){
    throw new BadRequestError(`Task ${id} is not a user upload task`);
  }


  const {filename, size: filesize} = task.data;
  const filepath = path.join(vfs.getTaskWorkspace(task.task_id), filename);
  const contentRange = req.get("Content-Range");

  const contentLength = parseInt(req.get("Content-Length")!);
  if(!contentLength || !Number.isInteger(contentLength)) throw new LengthRequiredError(`A valid Content-Length header must be provided`);

  if(task.status !== "initializing"){
    throw new BadRequestError(`Task ${id} is in state ${task.status}, which does not allow further data to be sent`);
  }


  async function processUpload(){
    await taskScheduler.run({
      task,
      handler: createUserUploadParser(),
    })
  }

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
  else if(ranges == -2 || !Array.isArray(ranges) || ranges.length != 1 || ranges.type !== "bytes") throw new BadRequestError(`Malformed range header`);
  
  const { start, end} = ranges[0];


  if(contentLength !== end - start + 1) throw new BadRequestError(`a Content-Length of ${contentLength} can't satisfy a range of ${end - start +1}`);
  
  // @fixme check current file size
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

function createUserUploadParser(): import("../../../tasks/types.js").TaskHandler<import("../../../tasks/types.js").TaskData, any, import("../../../tasks/types.js").TaskSchedulerContext> {
  throw new Error("Function not implemented.");
}
