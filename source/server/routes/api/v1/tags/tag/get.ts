
import { Request, Response } from "express";
import { getUser, getVfs } from "../../../../../utils/locals.js";

export default async function getTag(req :Request, res :Response){
  const requester = getUser(req);
  const vfs = getVfs(req);
  const {tag} = req.params;

  const scenes = await Promise.all((await vfs.getTag(tag, requester.uid)).map(s=>{
    return vfs.getScene(s, requester.uid);
  }));

  res.status(200).send(scenes);
}