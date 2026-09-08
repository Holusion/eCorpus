import {execFile} from "node:child_process";

import {Request, Response} from "express";

import { getVfs } from "../../../utils/locals.js";
import { BadRequestError, NotFoundError } from "../../../utils/errors.js";
import { FileProps } from "../../../vfs/types.js";
import { DELETE_KEY, diffDoc } from "../../../utils/merge/index.js";
import { fromPointers } from "../../../utils/merge/pointers/index.js";

const sizeMax = 400*1000;



/**
 * Computes a somewhat arbitrary text representation of the difference between 
 */
export default async function handleGetDiff(req :Request, res :Response){
  const vfs = getVfs(req);
  const {scene, id:idString, from:fromString="-1"} = req.params;
  const id = parseInt(idString);
  const fromIdOrGen = parseInt(fromString);
  if(!Number.isInteger(id)) throw new BadRequestError(`Requested fromId ${idString} is not a valid ID`);
  if(!Number.isInteger(fromIdOrGen)) throw new BadRequestError(`Requested toId ${fromString} is not a valid ID`);

  //`getFileById` looks up a global file id, but this route's rights were
  //checked against `:scene`. Both sides of the diff must be verified to belong
  //to it, or a file id from any other scene would be read under this scene's
  //access level. 404, like any other file the requester may not see.
  const {id: scene_id} = await vfs.getScene(scene);
  const inScene = <T extends {scene_id :number}>(file :T, ref :number)=>{
    if(file.scene_id !== scene_id) throw new NotFoundError(`No file found with id ${ref} in scene ${scene}`);
    return file;
  };

  const dstFile = inScene(await vfs.getFileById(id), id);
  let fromFile :FileProps;
  if(0 < fromIdOrGen){
    fromFile = inScene(await vfs.getFileById(fromIdOrGen), fromIdOrGen);
  }else if(0 < dstFile.generation + fromIdOrGen){
    fromFile = await vfs.getFileProps({
      scene: scene,
      name: dstFile.name,
      generation: dstFile.generation + fromIdOrGen,
      archive: true,
    }, true);
  }else{
    fromFile = {
      id: -1, //Ensure it _can't_ exist
      name: dstFile.name,
      mime: dstFile.mime,
      hash: null,
      data: undefined,
      size: 0,
      generation: 0,
      ctime: new Date(0),
      mtime: new Date(0),
      author_id: 0,
      author: "default",
    }
  }
  let diff:string;
  if(fromFile.data && dstFile.data && dstFile.mime == fromFile.mime && fromFile.mime === "application/si-dpo-3d.document+json"){
    try{
      let fromDoc = JSON.parse(fromFile.data);
      let toDoc = JSON.parse(dstFile.data);
      diff = `STRUCTURED CHANGES SUMMARY\n`+JSON.stringify(fromPointers(diffDoc(fromDoc, toDoc) as any), (key, value)=>{
        if(value === DELETE_KEY) return "*DELETED*";
        return value;
      }, 2);
    }catch(e:any){
      console.error("Failed to compile scene diff : ", e);
      diff = `Couldn't compile diff from #${fromFile.id} to #${dstFile.id}: ${e.message}`;
    }

  }else if(sizeMax < dstFile.size || sizeMax < fromFile.size){
    diff = "Diff not computed for large files"
  }else if(fromFile.hash === dstFile.hash){
    diff = "No differences";
  }else if(fromFile.hash === "directory" || dstFile.hash === "directory"){
    diff = "No diff for folders";
  }else{
    let srcPath = (vfs.exists(fromFile))? vfs.getPath(fromFile): "/dev/null";
    let dstPath = (vfs.exists(dstFile))? vfs.getPath(dstFile): "/dev/null";
    let stdout = await new Promise<string>((resolve, reject)=>{
        execFile("diff", [
          "--unified",
          "--tabsize=2",
          "--ignore-space-change",
          "--label", fromFile.name,
          "--label", dstFile.name,
          srcPath,
          dstPath
        ], {
        encoding: "utf8",
        timeout: 500,
      }, (error, stdout, stderr)=>{
        if(error && error.code != 0 && error.code != 1){
          return reject(error);
        }
        resolve(stdout);
      });
    });
    if(10000000 < stdout.length){
      diff = "Large diff not shown";
    }else{
      diff = stdout;
    }
  }

  res.format({
    "text/plain": ()=>{
      res.status(200).send(diff);
    },
    "application/json": ()=>{
      let src = {...fromFile, data: null};
      const dst = {...dstFile, data: null};
      res.status(200).send({src, dst, diff});
    }
  });
}