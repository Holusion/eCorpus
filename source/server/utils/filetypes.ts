import path from 'path';
import {Request} from "express";

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
  let ext = path.extname(name).toLowerCase();
  return mimeMap[ext] ?? "application/octet-stream";
}
/**
 * Infer a mime type from a request's Content-Type if possible
 * Defaults to application/octet-stream if Content-Type is none of the known values
 */
export function getContentType(req :Request){
  return  req.is(mimeList) || "application/octet-stream";
}
