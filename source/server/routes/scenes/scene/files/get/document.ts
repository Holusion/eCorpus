import { Request, Response } from "express";
import { createHash } from "crypto";

import { getVfs } from "../../../../../utils/locals.js";


/**
 * @todo use file compression for text assets. Data _should_ be compressed at rest on the server
 */
export default async function handleGetDocument(req :Request, res :Response){
  const vfs = getVfs(req);
  const {scene:scene_name} = req.params;
  let scene = await vfs.getScene(scene_name);
  let f = await vfs.getDoc(scene.id);
  let doc = JSON.parse(f.data);
  if(typeof doc.asset == "object"){
    //Filter our invalid documents
    //Inject document id to know the client's reference document if he submits a change
    doc.asset.id = f.id;
  }

  let data = Buffer.from(JSON.stringify(doc), "utf-8");
  let hash = createHash("sha256").update(data).digest("base64url");


  res.set("ETag", hash);
  res.set("Last-Modified", f.mtime.toUTCString());
  if(req.fresh){
    return res.status(304).send("Not Modified");
  }

  res.set("Content-Type", "application/si-dpo-3d.document+json");
  res.set("Content-Length", data.length.toString(10));
  res.status(200).send(data);
};
