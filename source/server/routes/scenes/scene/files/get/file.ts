import {pipeline} from "node:stream/promises";

import { Request, Response } from "express";
import { getVfs, getFileParams } from "../../../../../utils/locals.js";
import { BadRequestError, RangeNotSatisfiable} from "../../../../../utils/errors.js";

async function handleGetFileRange(req :Request, res :Response){
  const vfs = getVfs(req);
  const {scene, name} = getFileParams(req);
  let [startRange, endRange, ...rest] =  req.headers["range"]!.slice(6).split("-");
  if (rest.length){
    throw new BadRequestError(`Bad Request : Multiple ranges are not supported`);
  }
  if (typeof startRange === "undefined" || typeof endRange === "undefined" || (startRange.length == 0 && endRange.length==0)){
    throw new BadRequestError ("Bad Request : Range with no parameters")
  }
  let start =  (startRange.length > 0)?  parseInt(startRange): - parseInt(endRange);
  let end = (endRange.length && startRange.length > 0)? parseInt(endRange) + 1 : undefined;
  let file = await vfs.getFile({scene, name, start, end});
  end ??= file.size;
  if(start < 0){
    start += file.size; 
  }
  if (end && end > file.size){
    res.set("Content-Range", "bytes */" + file.size);
    if(startRange.length > 0){
      throw new RangeNotSatisfiable("Range Not Satisfiable: end after end of file")
    }else{
      throw new RangeNotSatisfiable("Range Not Satisfiable: Suffix-length is bigger than lenght of file")
    }
  }

  if(!file.stream){
    throw new BadRequestError(`${name} in ${scene} appears to be a directory`);
  }
  
  res.set("Accept-Ranges", "bytes");
  res.set("Content-Length", (end - start).toString());
  res.set("Content-Range", "bytes " + start.toString() + "-" + (end -1).toString() + "/"+ file.size.toString())
  res.status(206);
  try{
    await pipeline(
      file.stream,
      res,
    );
  }catch(e){
    if((e as any).code != "ERR_STREAM_PREMATURE_CLOSE") throw e;
  }
}



/**
 * @todo use file compression for text assets. Data _should_ be compressed at rest on the server
 */
export default async function handleGetFile(req :Request, res :Response){
  const vfs = getVfs(req);
  const {scene, name} = getFileParams(req);

  if(req.headers["range"]){
    return await handleGetFileRange(req, res);
  }
  const file = await vfs.getFile({ scene, name });
  if(!file.stream){
    throw new BadRequestError(`${name} in ${scene} appears to be a directory`);
  }

  res.set("Content-Length", file.size.toString(10));
  res.set("Accept-Ranges", "bytes");

  res.set("ETag", `W/${file.hash}`);
  res.set("Last-Modified", file.mtime.toUTCString());
  if(req.fresh){
    file.stream.destroy();
    return res.status(304).send("Not Modified");
  }
  res.set("Content-Type", file.mime);
  res.status(200);
  try{
    await pipeline(
      file.stream,
      res,
    );
  }catch(e){
    if((e as any).code != "ERR_STREAM_PREMATURE_CLOSE") throw e;
  }
}