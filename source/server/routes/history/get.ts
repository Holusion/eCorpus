
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
  let parsedLimit = limit? parseInt(limit as string): undefined;
  let parsedOffset = offset? parseInt(offset as string): undefined;
  let [documents, total] = await Promise.all([
    vfs.getSceneHistory(scene.id, {
      limit: parsedLimit,
      offset: parsedOffset,
      orderDirection: orderDirection as any,
    }),
    vfs.getSceneHistoryCount(scene.id),
  ]);
  res.set("X-Total-Count", total.toString());
  res.format({
    "application/json":()=>res.status(200).send(documents),
    "text": ()=> res.status(200).send(documents.map(doc =>`${doc.name}#${doc.generation}`).join("\n")+"\n"),
  });
};
