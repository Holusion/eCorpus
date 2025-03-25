import { Request, Response } from "express";

import { getMimeType, getContentType } from "../../../../../utils/filetypes.js";
import { getVfs, getUserId, getFileParams } from "../../../../../utils/locals.js";



export default async function handlePutFile(req :Request, res :Response){
  const vfs = getVfs(req);
  const user_id = getUserId(req);
  const { scene, name} = getFileParams(req);
  //If content-type can be inferred from the file's extension it's always better than the header
  // In particular because of https://github.com/Smithsonian/dpo-voyager/issues/202
  let mime = getContentType(req);
  let r = await vfs.writeFile(req, {user_id, scene, name, mime });
  res.status((r.generation === 1)?201:200).send("Created");
};
