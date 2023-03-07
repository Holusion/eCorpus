
import { getFileParams, getUserId, getVfs } from "../../../utils/locals";
import { Request, Response } from "express";
import Vfs, { FileType } from "../../../vfs";
import { BadRequestError, HTTPError } from "../../../utils/errors";
import { addDerivative, Asset } from "../../../utils/documents/edit";
import path from "path";
import { parse_glb } from "../../../utils/glTF";

/**
 * Guess FileType using content-type header
 */
function getContentType(req :Request) :FileType|"binary"|null{
  if(req.is("video")) return "videos";
  if(req.is("image")) return "images";
  if(req.is("model/gltf-binary")) return "models";
  if(req.is("text")) return "articles";
  else return "binary";
}

/**
 * Guess FileType using the filename's extension
 */
function getExtension(file :string) :FileType|null{
  let ext = path.extname(file);
  if(!ext || /\.(txt|html?)$/i.test(ext)) return "articles";
  if(/\.(jpg|png|webp|bmp)$/i.test(ext)) return "images";
  if(/\.(mp4|mkv|flv|mov)$/i.test(ext)) return "videos";
  if(/\.(glb|usdz)$/i.test(ext)) return "models";
  return null;
}

export default async function handlePutFile(req :Request, res :Response){
  const vfs = getVfs(req);
  const user_id = getUserId(req);
  let { scene, type, name} = getFileParams(req, false);

  const contentType = getContentType(req);
  const extType = getExtension(name);

  if(!type) {
    //Handle routes where type is not explicit
    let t = ((contentType != "binary")? contentType : extType);
    if(t == null) throw new BadRequestError(`Can't guess Content-Type for ${name}`);
    type = t;
  }
  
  if(contentType != "binary" && type != contentType) throw new BadRequestError(`Bad Content-Type: "${req.get("Content-Type")}" for file type "${type}"`);
  if(extType && type != extType) throw new BadRequestError(`Bad file extention "${path.extname(name)}" for file type ${type}`);

  let r = await vfs.writeFile(req, {user_id, scene, type, name});

  res.status((r.generation === 1)?201:200).send();
};
