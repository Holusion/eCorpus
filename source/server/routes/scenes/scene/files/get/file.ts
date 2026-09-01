import {pipeline} from "node:stream/promises";

import { Request, Response } from "express";
import { getVfs, getFileParams } from "../../../../../utils/locals.js";
import { BadRequestError, RangeNotSatisfiableError} from "../../../../../utils/errors.js";

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
  //A suffix range ("bytes=-500") asks for the last N bytes. It travels as a negative
  //start and gets resolved against the file size once we know it.
  const isSuffix = startRange.length == 0;
  let start =  (!isSuffix)?  parseInt(startRange): - parseInt(endRange);
  let end = (endRange.length && !isSuffix)? parseInt(endRange) + 1 : undefined;

  //Whatever can be ruled out from the header alone is ruled out before opening a stream:
  //fs.createReadStream() throws a RangeError on a non-numeric or reversed range, and that
  //would surface as an internal error rather than the client error it is.
  if(!Number.isInteger(start) || (typeof end === "number" && !Number.isInteger(end))){
    throw new BadRequestError(`Bad Request : Malformed range "${req.headers["range"]}"`);
  }
  if(typeof end === "number" && end <= start){
    throw new BadRequestError(`Bad Request : Range ends before it starts`);
  }

  let file = await vfs.getFile({scene, name, start, end});

  if(!file.stream){
    throw new BadRequestError(`${name} in ${scene} appears to be a directory`);
  }

  end ??= file.size;
  if(start < 0){
    //A suffix longer than the file selects the whole file (RFC 9110 §14.1.2)
    start = Math.max(0, start + file.size);
  }
  if (file.size <= start || end > file.size){
    //An unsatisfiable range still tells the client how long the file actually is
    file.stream.destroy();
    res.set("Content-Range", "bytes */" + file.size);
    throw new RangeNotSatisfiableError(`Range Not Satisfiable: ${(end > file.size)?"end":"start"} after end of file`);
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