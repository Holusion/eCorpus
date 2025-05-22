import {pipeline} from "node:stream/promises";

import { Request, Response } from "express";
import { getVfs, getFileParams } from "../../../../../utils/locals.js";
import { BadRequestError } from "../../../../../utils/errors.js";


/**
 * @todo use file compression for text assets. Data _should_ be compressed at rest on the server
 */
export default async function handleGetFile(req :Request, res :Response){
  const vfs = getVfs(req);
  const {scene, name} = getFileParams(req);
  let f;
  if(req.headers["content-type"]=='multipart/byteranges'){
    let byteRange =  req.headers["range"]!.slice(6).split("-").map(x => parseInt(x));
    let start = byteRange[0];
    let end = byteRange[1];
    f = await vfs.getFile({ scene, name, start, end})
    res.set("Content-Length", (end - start + 1).toString());
  }
  else {
    f = await vfs.getFile({ scene, name });
    res.set("Content-Length", f.size.toString(10));
  }
  if(!f.stream){
    throw new BadRequestError(`${name} in ${scene} appears to be a directory`);
  }
  res.set("ETag", `W/${f.hash}`);
  res.set("Last-Modified", f.mtime.toUTCString());
  if(req.fresh){
    f.stream.destroy();
    return res.status(304).send("Not Modified");
  }
  
  res.set("Content-Type", f.mime);
  res.status(200);
  try{
    await pipeline(
      f.stream,
      res,
    );
  }catch(e){
    if((e as any).code != "ERR_STREAM_PREMATURE_CLOSE") throw e;
  }
};