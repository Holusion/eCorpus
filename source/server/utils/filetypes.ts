import path from 'path';
import {Request} from "express";

export function getMimeType(name:string){
  let ext = path.extname(name).toLowerCase();
  if(!ext || 5 < ext.length) return "application/octet-stream";
  if(ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
  if(ext == ".png") return "image/png";
  if(ext == ".webp") return "image/webp";
  if(ext == ".mp4") return "video/mp4";
  if(ext == ".htm" || ext == ".html") return "text/html";
  if(ext == ".txt") return "text/plain";
  return "application/octet-stream";
}

export function getContentType(req :Request){
  return  req.is([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "text/html",
    "application/json",
  ]) || "application/octet-stream";
}
