import {pipeline} from "node:stream/promises";

import { Request, Response } from "express";
import { getVfs, getFileParams } from "../../../../../utils/locals.js";
import { BadRequestError, RangeNotSatisfiableError} from "../../../../../utils/errors.js";

/**
 * Whether an `If-Range` validator still describes the representation we hold, per
 * RFC 9110 §13.1.5: an entity tag must match strongly and a date exactly. Anything we
 * cannot validate — a weak tag, an unparseable value — means no, and the client gets the
 * whole representation rather than a range it would splice onto stale bytes.
 */
function matchesIfRange(header :string, file :{hash :string|null, mtime :Date}) :boolean{
  const value = header.trim();
  if(value.startsWith("W/")) return false;
  if(value.startsWith(`"`)) return !!file.hash && value === `"${file.hash}"`;
  const date = Date.parse(value);
  //Compared against the same second-resolution string `Last-Modified` carries, because
  //that is all the client ever saw of our mtime.
  return Number.isFinite(date) && date === Date.parse(file.mtime.toUTCString());
}

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

  const ifRange = req.get("If-Range");
  if(typeof ifRange === "string" && !matchesIfRange(ifRange, file)){
    //The file changed since the client got its first chunk. Answering with a range would
    //have it stitch these bytes onto a different version, so send the whole thing instead.
    file.stream.destroy();
    return await sendWholeFile(req, res);
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
  //Same validators as the 200: without them a client resuming a download has no way to
  //tell that the pieces it is assembling all come from one version.
  res.set("ETag", `"${file.hash}"`);
  res.set("Last-Modified", file.mtime.toUTCString());
  res.set("Content-Type", file.mime);
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
async function sendWholeFile(req :Request, res :Response){
  const vfs = getVfs(req);
  const {scene, name} = getFileParams(req);

  const file = await vfs.getFile({ scene, name });
  if(!file.stream){
    throw new BadRequestError(`${name} in ${scene} appears to be a directory`);
  }

  res.set("Content-Length", file.size.toString(10));
  res.set("Accept-Ranges", "bytes");

  //Strong: `hash` is the sha256 of exactly the bytes we are about to send, so it is a
  //byte-for-byte validator. Marking it weak would also bar it from `If-Match`.
  res.set("ETag", `"${file.hash}"`);
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

/**
 * Serves a whole file, or a single range of one when the request asks for it.
 */
export default async function handleGetFile(req :Request, res :Response){
  if(req.headers["range"]){
    return await handleGetFileRange(req, res);
  }
  return await sendWholeFile(req, res);
}
