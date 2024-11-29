
import { Request, Response } from "express";
import { getVfs } from "../../utils/locals.js";


export default async function getSceneHistory(req :Request, res :Response){
  let vfs = getVfs(req);
  let {scene:sceneName} = req.params;
  let {
    limit,
    offset,
    orderDirection,
  } = req.query;
  
  let scene = await vfs.getScene(sceneName);
  let documents = await vfs.getSceneHistory(scene.id, {
    limit: limit? parseInt(limit as string): undefined,
    offset: offset? parseInt(offset as string): undefined,
    orderDirection: orderDirection as any,
  });
  res.format({
    "application/json":()=>res.status(200).send(documents),
    "text": ()=> res.status(200).send(documents.map(doc =>`${doc.name}#${doc.generation}`).join("\n")+"\n"),
  });
};
