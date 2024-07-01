import { Request, Response } from "express";
import { getFileParams, getUser, getVfs } from "../../utils/locals.js";
import { normalize } from "path";
import { BadRequestError } from "../../utils/errors.js";


export async function handleCreateScene(req :Request, res :Response){
  let vfs = getVfs(req);
  let requester = getUser(req);
  let {scene} = req.params;
  if(!requester.uid){
    throw new BadRequestError(`Requires an authenticated user`);
  }
  await vfs.createScene(scene, requester.uid);
  return res.status(201).send("Created");
}



export async function handleMkcol(req :Request, res :Response){
  let vfs = getVfs(req);
  let requester = getUser(req);
  let {scene, name} = getFileParams(req);

  let dirname = normalize(name);
  if(dirname.startsWith(".") || dirname.startsWith("/")) throw new BadRequestError("Not a valid folder name");

  await vfs.createFolder({scene, name: dirname, user_id: requester.uid });
  res.status(201).send("Created");
}