import { createWriteStream } from "fs";
import path from "path";
import { Request, Response } from "express";
import contentDisposition from "content-disposition";

import { BadRequestError,  InternalError, UnauthorizedError } from "../../utils/errors.js";
import { extFromType } from "../../utils/filetypes.js";
import { getVfs, getUser,  getUserManager, getTaskScheduler } from "../../utils/locals.js";
import uid, { Uid } from "../../utils/uid.js";

import { pipeline } from "stream/promises";
import { Dictionary } from "../../utils/schema/types.js";
import { ImportSceneResult, parseUserUpload, ParsedUserUpload } from "../../tasks/handlers/uploads.js";
import { extractScenesArchive } from "../../tasks/handlers/extractZip.js";


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
  const requester = getUser(req);
  if (requester === null){ throw new UnauthorizedError("No identified user")}
  let userManager = getUserManager(req);
  let taskScheduler = getTaskScheduler(req);

  let filename = getFilename(req.headers) as string;
  if(!filename) throw new BadRequestError(`Can't detect file type from Content-Disposition or Content-Type headers`);
  let size = parseInt(req.headers["content-length"]!);
  if(!size || !Number.isInteger(size)) throw new BadRequestError(`Chunked encoding not supported for this request. Use upload tasks to transfer large files`);

  const output = await taskScheduler.run<undefined>({
    scene_id: null,
    user_id: requester.uid,
    type: "handlePostScene",
    immediate: true,
    handler: async function handlePostScene({task, context:{vfs, logger}}) :Promise<ImportSceneResult[]>{
      const dir = await vfs.createTaskWorkspace(task.task_id);
      const abs_filepath = path.join(dir, filename);
      const relPath = vfs.relative(abs_filepath);
      logger.log("Write upload file to :", relPath);
      const ws = createWriteStream(abs_filepath);
      await pipeline(
        req,
        ws,
      );
      logger.log("file uploaded to :", relPath);
      return await taskScheduler.run({
        scene_id: null,
        user_id: requester.uid,
        data: {fileLocation: relPath, size},
        handler: extractScenesArchive,
      });
    }
  });

  res.status(200).send(output);
}

export default async function postScenes(req :Request, res :Response){
  const requester = getUser(req);
  if (requester === null){ throw new UnauthorizedError("No identified user")}
  let userManager = getUserManager(req);
  
  if(req.is("multipart") || req.is("application/x-www-form-urlencoded")){
    throw new BadRequestError(`Form data is not supported on this route. Provide a raw Zip attachment`);
  }

  return await postRawZipfile(req, res);
};