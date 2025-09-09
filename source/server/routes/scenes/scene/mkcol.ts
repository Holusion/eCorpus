import { Request, Response } from "express";
import { getFileParams, getUserId, getVfs } from "../../../utils/locals.js";
import { normalize } from "path";
import { BadRequestError } from "../../../utils/errors.js";


export default async function handleCreateScene(req :Request, res :Response){
  let vfs = getVfs(req);
  let requester = getUserId(req);
  let {scene} = req.params;
  if(!requester){
    throw new BadRequestError(`Requires an authenticated user`);
  }
  await vfs.createScene(scene, requester);
  return res.status(201).send("Created");
}
