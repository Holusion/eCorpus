import { Request, Response } from "express";
import { normalize } from "path";

import { BadRequestError, UnauthorizedError } from "../../../../../utils/errors.js";
import { getVfs, getUser, getFileParams } from "../../../../../utils/locals.js";




export default async function handleCreateFolderl(req :Request, res :Response){
  let vfs = getVfs(req);
  let requester = getUser(req);
  let {scene, name} = getFileParams(req);

  let dirname = normalize(name);
  if(dirname.startsWith(".") || dirname.startsWith("/")) throw new BadRequestError("Not a valid folder name");
  if(!requester) throw new UnauthorizedError("No identified user");

  await vfs.createFolder({scene, name: dirname, user_id: requester.uid });
  res.status(201).send("Created");
}