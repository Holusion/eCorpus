import { apiMessage } from "../../../../../utils/messages/index.js";
import { Request, Response } from "express";

import { BadRequestError, ForbiddenError } from "../../../../../utils/errors.js";
import { getVfs, getUserId, getFileParams } from "../../../../../utils/locals.js";



/**
 * 
 * @todo does not support Overwrite header
 */
export default async function handleMoveFile(req :Request, res :Response){
  let vfs = getVfs(req);
  let user_id = getUserId(req);
  let {name, scene} = getFileParams(req);
  let dest = new URL(req.get("Destination") ?? "", `${req.protocol}://${req.hostname}${req.originalUrl}`);
  if(!req.get("Destination")) throw new BadRequestError(apiMessage("errors.invalid-destination-header", { value1: String(req.get("Destination")) }));
  if(!dest.pathname.startsWith(`/scenes/${scene}/`)) throw new BadRequestError(apiMessage("errors.source-and-destination-scenes-do-not-match-from-to", { value1: String(dest.pathname.split("/")[2]), value2: String(scene) }));
  if(dest.pathname ==  req.originalUrl ) throw new ForbiddenError(apiMessage("errors.can-t-move-a-file-keeping-the-same-name"));
  console.log("rename from %s to %s", name, dest.pathname.slice(`/scenes/${scene}/`.length) );
  await vfs.renameFile({scene, name, user_id}, dest.pathname.slice(`/scenes/${scene}/`.length));
  res.format({
    "application/json":()=>res.status(201).send({code: 201, message: "Created"}),
    "text/plain": ()=>res.status(201).send("Created"),
  });
}
