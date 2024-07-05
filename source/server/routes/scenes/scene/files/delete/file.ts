import { Request, Response } from "express";
import { getVfs, getUserId, getFileParams } from "../../../../../utils/locals.js";

/**
 * @todo use file compression for text assets. Data _should_ be compressed at rest on the server
 */
export default async function handleDeleteFile(req :Request, res :Response){
  const vfs = getVfs(req);
  let user_id = getUserId(req);
  const {scene, name} = getFileParams(req);
  await vfs.removeFile({ scene, name, user_id });
  res.status(204).send();
};