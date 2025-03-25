import path from 'path';
import {Request} from "express";
import {lookup, types} from "mime-types";

const mimeMap :Record<string,string> = {
  ".jpg": "image.jpeg",
  ".jpeg": "image.jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".glb": "model/gltf-binary",
  ".htm": "text/html",
  ".html": "text/html",
  ".txt": "text/plain",
  ".json": "application/json",
  ".svx.json":"application/si-dpo-3d.document+json",
}
const mimeList = Object.values(mimeMap);

export function getMimeType(name:string){
  //Special case because extname doesn't recognize double-extensions
  if(/\.svx\.json$/i.test(name)) return "application/si-dpo-3d.document+json";
  return lookup(name) || "application/octet-stream";
}
/**
 * Infer a mime type from a request's Content-Type if possible
 * Defaults to application/octet-stream if Content-Type is none of the known values
 */
export function getContentType(req :Request){
  const inferred = getMimeType(req.originalUrl);
  if(inferred != "application/octet-stream") return inferred;
  return req.get("content-type") || "application/octet-stream";
}

/**
 * Checks whether a MIME type should be compressed using gzip
 */
export function compressedMime(mime :string) :boolean{
  if( /^(?:image|video)\//.test(mime)){
    return ["image/tiff", "image/svg+xml", "image/bmp"].indexOf(mime) !== -1;
  }else if(mime.startsWith("application")){
    if(mime.endsWith("zip")) return false; //A whole lot of things are application/**+zip
  }
  return true;
}