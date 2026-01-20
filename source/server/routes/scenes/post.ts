import fs from "fs/promises";
import { createReadStream, createWriteStream } from "fs";
import path from "path";
import { text } from 'stream/consumers';
import { Request, Response } from "express";
import yauzl, { Entry, ZipFile } from "yauzl";
import contentDisposition from "content-disposition";

import { BadRequestError, HTTPError, InternalError, UnauthorizedError } from "../../utils/errors.js";
import { extFromType, getMimeType } from "../../utils/filetypes.js";
import { getVfs, getUser, isCreator, getUserManager, getTaskScheduler } from "../../utils/locals.js";
import uid, { Uid } from "../../utils/uid.js";
import { once } from "events";
import { Readable } from "stream";
import { finished, pipeline } from "stream/promises";
import { isUserAtLeast } from "../../auth/User.js";
import { Dictionary } from "../../utils/schema/types.js";


interface ImportResults {
  fail:Dictionary<string>;
  ok:string[];
}

export function getFilename(headers: Request["headers"]) :string|undefined{
  const disposition = headers["content-disposition"]?contentDisposition.parse(headers["content-disposition"]): null;
  if(disposition?.parameters?.filename) return disposition?.parameters?.filename;
  const mimeType = headers["content-type"] ?? "application/octet-stream";
  const ext = extFromType(mimeType);
  if(ext){
    return uid(12) + ext;
  }
  return undefined;
}



export async function postRawZipfile(req: Request, res: Response){

  let vfs = getVfs(req);
  const requester = getUser(req);
  if (requester === null){ throw new UnauthorizedError("No identified user")}
  let userManager = getUserManager(req);
  let taskScheduler = getTaskScheduler(req);

  let filename = getFilename(req.headers);
  if(!filename) throw new BadRequestError(`Can't detect file type from Content-Disposition or Content-Type headers`);
  let size = parseInt(req.headers["content-length"]!);
  if(!size || !Number.isInteger(size)) throw new BadRequestError(`Chunked encoding not supported for this request. Use upload tasks to transfer large files`);
  let upload_task = await taskScheduler.create(null, requester.uid, {type: "userUploads", data:{ filename, size}});

  let tmpfile = path.join(await vfs.createTaskWorkspace(upload_task), filename);
  const ws = createWriteStream(tmpfile);
  await pipeline(
    req,
    ws,
  );

  //Allow the task to proceed normally
  await taskScheduler.setTaskStatus(upload_task, "pending");
  console.log("Process Uploaded file")
  const process_task = await taskScheduler.createChild(upload_task, {type: "processUploadedFiles", data: {}, after: [upload_task]});
  const output = await taskScheduler.wait(process_task);
  if(!Array.isArray(output)) throw new InternalError(`Unexpected output for upload processing task : ${JSON.stringify(output)}`);
  
  res.status(200).send(output.flat());
}

export default async function postScenes(req :Request, res :Response){
  let vfs = getVfs(req);
  const requester = getUser(req);
  if (requester === null){ throw new UnauthorizedError("No identified user")}
  let userManager = getUserManager(req);
  
  if(req.is("multipart") || req.is("application/x-www-form-urlencoded")){
    throw new BadRequestError(`Form data is not supported on this route. Provide a raw Zip attachment`);
  }

  return await postRawZipfile(req, res);
};