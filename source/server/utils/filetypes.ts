import fs from 'fs/promises';

import {Request} from "express";
import {lookup, types, extension, extensions} from "mime-types";

//Add non-standard extension
extensions["application/si-dpo-3d.document+json"] = ["svx.json"];

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

/**
 * Returns standard extension with a leading dot for a given mime type
 * Returns an empty string for extensionless types (eg: application/octet-stream)
 */
export function extFromType(type: string){
  let ext = extension(type);
  if(ext === "bin") return "";
  return `.${ext}`;
}

export async function readMagicBytes(filepath: string): Promise<string>{
  let handle = await fs.open(filepath, fs.constants.O_RDONLY);
  try{
    const b = Buffer.alloc(12);
    const {bytesRead} = await handle.read(b);
    console.log("Read :", bytesRead, b.subarray(0, 4).toString("hex"));
    return parseMagicBytes(b.subarray(0, bytesRead));
  }finally{
    await handle.close();
  }
}

/**
 * Seek the first bytes of a file to find type signatures.
 * Most files have 4 bytes signatures.
 * RIFF containers (eg: webp) needs at least 12 bytes of content
 * @see {@link https://en.wikipedia.org/wiki/List_of_file_signatures File Signatures }
 */
export function parseMagicBytes(src: Buffer|Uint8Array) :string{
  if(src[0] == 0x89 && src.subarray(0, 8).toString("hex") == "89504e470d0a1a0a"){
    return "image/png";
  }

  if(src[0] == 0xFF && src.subarray(0, 3).toString("hex") == "ffd8ff"){
    return "image/jpeg";
  }

  if(src[0] == 0x52 && src.subarray(0, 4).toString("ascii") == "RIFF"){
    //RIFF files. Next 4 bytes are for the file size.
    let sig = src.subarray(8, 12).toString();
    if(sig == "WEBP") return "image/webp";
  }

  if(src[0] == 0x67 && src.subarray(0, 4).toString("ascii") == "glTF"){
    return "model/gltf-binary";
  }

  if(src[0] == 0x50 && src.subarray(0, 4).toString("hex") == "504b0304"){
    return "application/zip";
  }

  return "application/octet-stream";
}
