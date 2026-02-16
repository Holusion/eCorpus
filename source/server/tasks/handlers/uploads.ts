import { once } from "node:events";
import { stat } from "node:fs/promises";
import path, { extname } from "node:path";

import yauzl, { ZipFile } from "yauzl";
import { isUserAtLeast } from "../../auth/User.js";
import { toAccessLevel } from "../../auth/UserManager.js";
import { parseFilepath, isMainSceneFile } from "../../utils/archives.js";
import { TaskHandlerParams } from "../types.js";
import { BadRequestError, InternalError, UnauthorizedError } from "../../utils/errors.js";
import { extractScenesArchive, ImportSuccessResult } from "./extractZip.js";



export interface ImportSceneResult{
  name: string;
  action: "create"|"update"|"error";
  error?: string;
}

export interface UploadHandlerParams{
  filename: string;
  mime?: string;
  size: number;
}

export interface UserUploadResult{
  filepath: string;
  files: string[];
  scenes: ImportSceneResult[];
}

/**
 * Inspect a user-uploaded file to detect its contents
 * @param param0 
 * @returns 
 */
export async function parseUserUpload({task:{task_id, user_id, data:{filename, size}}, context: {vfs, userManager, logger}}:TaskHandlerParams<UploadHandlerParams>):Promise<UserUploadResult>{

  let files :string[] = [];
  logger.debug("Requester :", user_id);
  const requester = await userManager.getUserById(user_id);
  const filepath = path.join(vfs.getTaskWorkspace(task_id), filename);
  logger.debug(`Checking size of uploaded file ${filepath}`);
  let diskSize: number;
  try{
    const stats=  await stat(filepath);
    diskSize = stats.size;
  }catch(e:any){
    if(e.code === "ENOENT"){
      logger.error(`File ${filepath} does not exist. Maybe it wasn't uploaded properly?`);
    }
      throw e;
  }
  if(diskSize != size){
    throw new Error(`Expected a file of size ${size}, found ${diskSize}`);
  }

  const ext = extname(filename).toLowerCase();
  if(ext == ".zip"){
    logger.debug(`Open ${filename} to list entries`);
    let zip = await new Promise<ZipFile>((resolve,reject)=>yauzl.open(filepath, {lazyEntries: false, autoClose: true}, (err, zip)=>(err?reject(err): resolve(zip))));
    zip.on("entry", (record)=>{
      files.push(record.fileName); 
    });
    await once(zip, "close");
    logger.debug(`Found ${files.length} entries in zip`);
  }else{
    files.push(filename);
  }

  let scenes :ImportSceneResult[] = [];
  for(let file of files){
    const {scene, name} = parseFilepath(file);
    if(!scene || !name || !isMainSceneFile(file)) continue;
    let action :"create"|"update"|"error";
    let error: string;
    try{
      const level = toAccessLevel(await userManager.getAccessRights(scene, user_id));
      if(level < toAccessLevel("write")){
        action = "error";
        error = `User doesn't have write permissions on scene ${scene}`;
      }else{
        action = "update";
      }
    }catch(e:any){
      if(e.code !== 404) throw e;
      if(isUserAtLeast(requester, "create")){
        action = "create"
      }else{
        action = "error";
        error = "User doesn't have permission to create a new scene";
      }
    }
    scenes.push({name: scene, action, error: error!});
  }
  // @FIXME maybe we should already delete the file if it has errors?
  // It depends on the behaviour we expect of a "partial success" zip upload.

  return {
    filepath: vfs.relative(filepath),
    files: files,
    scenes
  } satisfies UserUploadResult;
}



export interface ProcessUploadedFilesParams{
  tasks: number[];
  name: string;
  lang: string;
}

/**
 * Process file(s) that have been uploaded through `userUploads` task(s).
 * The file(s) are expected to come from previous tasks
 */
export async function createSceneFromFiles({context:{tasks, vfs, logger}, task: {user_id, data:{tasks:source_ids, name, lang}}}: TaskHandlerParams<ProcessUploadedFilesParams>):Promise<number>{
  if(!user_id) throw new InternalError(`Can't create an anonymous scene. Provide a user`);
  if(!name) throw new BadRequestError(`Can't create a scene without a name`);
  if(!lang) throw new BadRequestError(`Default language is required for scene creation`);
  if(!source_ids.length) throw new BadRequestError(`This task requires at least one source file`);

  for(const task_id of source_ids){
    if(!Number.isInteger(task_id)) throw new BadRequestError(`Invalid source task id: ${task_id}`);
  }
  const source_tasks = await Promise.all(source_ids.map(id=> tasks.getTask<UploadHandlerParams, UserUploadResult>(id)));

  const scene = await vfs.createScene(name, user_id);

  // @TODO: reparent everything to this task and this task to the created scene for better discoverability

  for(let task of source_tasks){
    const {filename, mime} = task.data;
    const artifact = task.output.filepath;
    if(/\.zip/i.test(artifact)){
      logger.warn("in-scene Zip extraction is not yet implemented. Aborting");
    }
    logger.debug("Copy uploaded file "+artifact);
    await vfs.copyFile(artifact, {scene, name: filename, user_id });
  }

  //TODO cleanup: unlink tasks artifacts
  return scene;
}