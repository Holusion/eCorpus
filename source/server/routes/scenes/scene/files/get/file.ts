import {pipeline} from "node:stream/promises";

import { Request, Response } from "express";
import { getVfs, getFileParams } from "../../../../../utils/locals.js";
import { BadRequestError, RangeNotSatisfiable} from "../../../../../utils/errors.js";


/**
 * @todo use file compression for text assets. Data _should_ be compressed at rest on the server
 */
export default async function handleGetFile(req :Request, res :Response){
  const vfs = getVfs(req);
  const {scene, name} = getFileParams(req);
  let file;
  const fileLength =  (await vfs.getFileProps({scene, name})).size;
  if(req.headers["range"]){
    let byteRange =  req.headers["range"]!.slice(6).split("-");
    let start, end;
    if (byteRange.length > 2){
      throw new BadRequestError(`Bad Request : Multiple ranges are not supported`);
    }
    if (byteRange.length == 0 || byteRange.length ==1 || (byteRange[0].length== 0 && byteRange[1].length==0)){
      throw new BadRequestError ("Bad Request : Range with no parameters")
    }
    // if there is a start value
    else if (byteRange[0].length > 0) {
        start = parseInt(byteRange[0]);
        end = (byteRange[1].length > 0)  ? parseInt(byteRange[1]) + 1 : fileLength;
        if (end > fileLength){
          res.set("Content-Range", "bytes */" + fileLength);
          throw new RangeNotSatisfiable("Range Not Satisfiable: end after end of file")
        }
       }
    // suffix - n last bytes
    else {
        const n = parseInt(byteRange[1]);
        if (n > fileLength){
          res.set("Content-Range", "bytes */" + fileLength);
          throw new RangeNotSatisfiable("Range Not Satisfiable: Suffix-length is bigger than lenght of file")
        }
        start = fileLength - n;
        end = fileLength
    }
    file = await vfs.getFile({scene, name, start, end})
    res.set("Content-Length", (end - start).toString());
    res.set("Content-Range", "bytes " + start.toString() + "-" + (end -1).toString() + "/"+ fileLength.toString())
    res.status(206);
  }
  else {
    file = await vfs.getFile({ scene, name });
    res.set("Content-Length", file.size.toString(10));
    res.status(200);
  }
  if(!file.stream){
    throw new BadRequestError(`${name} in ${scene} appears to be a directory`);
  }
  res.set("ETag", `W/${file.hash}`);
  res.set("Last-Modified", file.mtime.toUTCString());
  if(req.fresh){
    file.stream.destroy();
    return res.status(304).send("Not Modified");
  }
  res.set("Accept-Ranges", "bytes");
  res.set("Content-Type", file.mime);
  try{
    await pipeline(
      file.stream,
      res,
    );
  }catch(e){
    if((e as any).code != "ERR_STREAM_PREMATURE_CLOSE") throw e;
  }
}