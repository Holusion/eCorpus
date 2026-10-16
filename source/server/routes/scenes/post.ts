import { apiMessage } from "../../utils/messages/index.js";
import { createWriteStream } from "fs";
import path from "path";
import { Request, Response } from "express";

import { BadRequestError, UnauthorizedError } from "../../utils/errors.js";
import { getFilename } from "../../utils/filetypes.js";
import { getUser, getUserManager, getTaskScheduler } from "../../utils/locals.js";


import { pipeline } from "stream/promises";
import { Dictionary } from "../../utils/schema/types.js";
import { ImportSceneResult } from "../../tasks/handlers/uploads.js";
import { extractScenesArchive } from "../../tasks/handlers/extractZip.js";


interface ImportResults {
  fail: Dictionary<string>;
  ok: string[];
}

export async function postRawZipfile(req: Request, res: Response) {
  const requester = getUser(req);
  if (requester === null) { throw new UnauthorizedError(apiMessage("errors.no-identified-user")) }
  let userManager = getUserManager(req);
  let taskScheduler = getTaskScheduler(req);

  let filename = getFilename(req.headers) as string;
  if (!filename) throw new BadRequestError(apiMessage("errors.can-t-detect-file-type-from-content-disposition-or-content-type-headers"));
  let size = parseInt(req.headers["content-length"]!);
  if (!size || !Number.isInteger(size)) throw new BadRequestError(apiMessage("errors.chunked-encoding-not-supported-for-this-request-use-upload-tasks-to-transfer-large-fi"));

  const output = await taskScheduler.run<undefined>({
    scene_id: null,
    user_id: requester.uid,
    type: "handlePostScene",
    immediate: true,
    handler: async function handlePostScene({ task, context: { vfs, logger } }): Promise<ImportSceneResult[]> {
      const dir = await vfs.createTaskWorkspace(task.task_id);
      //Ensure path sanitization, even though getFilename shouldn't yield absolute paths
      const relPath = vfs.relative(path.join(dir, filename));
      const abs_filepath = vfs.absolute(relPath);
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
        data: { fileLocation: relPath, size },
        handler: extractScenesArchive,
      });
    }
  });

  res.status(200).send(output);
}

export default async function postScenes(req: Request, res: Response) {
  const requester = getUser(req);
  if (requester === null) { throw new UnauthorizedError(apiMessage("errors.no-identified-user")) }

  if (req.is("multipart") || req.is("application/x-www-form-urlencoded")) {
    throw new BadRequestError(apiMessage("errors.form-data-is-not-supported-on-this-route-provide-a-raw-zip-attachment"));
  }

  return await postRawZipfile(req, res);
};