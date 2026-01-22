import { once } from "node:events";
import { stat } from "node:fs/promises";
import path, { extname } from "node:path";

import yauzl, { ZipFile } from "yauzl";
import { isUserAtLeast } from "../../auth/User.js";
import { toAccessLevel } from "../../auth/UserManager.js";
import { parseFilepath, isMainSceneFile } from "../../utils/archives.js";
import { TaskHandlerParams } from "../types.js";
import { BadRequestError, UnauthorizedError } from "../../utils/errors.js";



export interface ImportSceneResult{
  name: string;
  action: "create"|"update"|"error";
  error?: string;
}

export interface UploadHandlerParams{
  filepath: string;
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
export async function parseUserUpload({task:{task_id, user_id, data:{filepath, size}}, context: {vfs, userManager, logger}}:TaskHandlerParams<UploadHandlerParams>):Promise<UserUploadResult>{

  let files :string[] = [];
  logger.debug("Requester :", user_id);
  const requester = await userManager.getUserById(user_id);
  const filename = path.basename(filepath);
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



/**
 * Process file(s) that have been uploaded through `userUploads` task(s).
 * The file(s) are expected to come from previous tasks' outputs
 */
export async function processUploadedFiles({context:{vfs, logger}, task: {data:{files}}}: TaskHandlerParams<{files:UserUploadResult[]}>):Promise<void>{

  if(!files.length) throw new BadRequestError(`This task requires at least one source file`);

  const upload_scenes =  files.findIndex(u=>u.scenes.length) !== -1 //A file containing at least one complete scene
  const upload_files = files.findIndex(u=>!u.scenes.length) !== -1 // A file NOT containing any complete scene
  // Don't allow mixed-content. ie. a scene archive with some asset files
  // In reality we _could_ probably, though we'd have to think carefully about edge cases?
  if( upload_scenes && upload_files ){
    throw new BadRequestError(`Can't do mixed-content processing. Provide EITHER scene archive(s) OR source file(s)`);
  }

  //Check that everything _should_ be error-free
  //We might still have fails because of race conditions or _things_, but it is preferable to have a preflight check
  const errors = files.map(u=>u.scenes.filter(s=>s.action === "error")).flat();
  for(let {error, name} of errors){
    logger.error(error  ?? `Unspecified error on scene ${name}`);
  }

  // @FIXME should we clean up some things immediately when we abort due to planned errors?
  if(errors.length){
    throw new UnauthorizedError(`Insufficient permissions on scene${1 < errors.length?"s":""} [${errors.slice(0, 3).map(({name})=>name)}${3 < errors.length?", ...":""}] for this user. Aborting.`);
  }

  /**
  return await tasks.group(async function* createChildren(context){
    for(let upload of files){
      if(upload_scenes){
        logger.debug("Extract uploaded scenes archive "+upload.filepath);
        //yield context.create({type: "extractScenesArchive", data: {filepath: upload.filepath}});
      }
    }
  });
  //*/
}