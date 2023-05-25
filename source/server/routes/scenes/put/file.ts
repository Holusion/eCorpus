
import { getFileParams, getUserId, getVfs } from "../../../utils/locals";
import { Request, Response } from "express";
import { getContentType, getMimeType } from "../../../utils/filetypes";


export default async function handlePutFile(req :Request, res :Response){
  const vfs = getVfs(req);
  const user_id = getUserId(req);
  const { scene, name} = getFileParams(req);
  //If content-type can be inferred from the file's extension it's always better than the header
  // In particular because of https://github.com/Smithsonian/dpo-voyager/issues/202
  let mime = getMimeType(name);
  if(mime == "application/octet-stream"){
    mime = getContentType(req);
  }
  let r = await vfs.writeFile(req, {user_id, scene, name, mime });
  res.status((r.generation === 1)?201:200).send("Created");
};
