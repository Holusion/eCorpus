
import path from "path";
import { Request, Response } from "express";
import { getHost, getUser, getVfs } from "../../../utils/locals.js";

export default async function getTag(req :Request, res :Response){
  const host = getHost(req);
  const requester = getUser(req);
  const vfs = getVfs(req);
  const {tag} = req.params;

  const scenes = await Promise.all((await vfs.getTag(tag, requester.uid)).map(async id=>{
    let scene =  await vfs.getScene(id, requester.uid);
    if(scene.thumb) scene.thumb = new URL(encodeURI(path.join("/scenes/", scene.name, scene.thumb)), host).toString();
    return scene;
  }));

  res.status(200).send(scenes);
}