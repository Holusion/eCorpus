import path, { basename, extname } from "node:path";
import { BadRequestError, ForbiddenError, UnauthorizedError } from "../../utils/errors.js";
import { ImportSceneResult, requireFileInput, TaskDefinition, TaskHandlerParams, TaskTypeData } from "../types.js";
import { TLanguageType } from "../../utils/schema/common.js";
import uid from "../../utils/uid.js";
import { createReadStream } from "node:fs";
import { WriteFileParams } from "../../vfs/types.js";
import { AssetDefinition } from "./createDocument.js";
import { TDerivativeQuality } from "../../utils/schema/model.js";
import { readdir, stat } from "node:fs/promises";
import yauzl, { Entry, ZipFile } from "yauzl";
import { on, once } from "node:events";
import { toAccessLevel } from "../../auth/UserManager.js";
import { isUserAtLeast } from "../../auth/User.js";
import { isMainSceneFile, parseFilepath } from "../../utils/archives.js";


interface UploadFileParams{
  files: {
    path: string,
    name: string,
    type: string,
  }[],
  optimize: boolean,
  scene_name: string,
  user_id: number,
  language?: TLanguageType,
}
/**
 * Analyze an uploaded file and create child task(s) accordingly
 */
export async function handleUploads({task: {task_id, fk_scene_id:scene_id, data:{files, scene_name, user_id, language, optimize}}, context:{signal, config, logger, tasks}}:TaskHandlerParams<UploadFileParams>):Promise<number>{

  //Do some preprocessing to check what we should generate?
  /** @fixme handle other formats */
  const modelFiles = files.filter(m=>m.type ==="model/gltf-binary" || m.name.toLowerCase().endsWith(".glb"));
  const with_lod = 1 < modelFiles.length;
  let qualities :TDerivativeQuality[] = ["High"];
  if(with_lod){
    logger.log("Multiple models : enable all quality levels");
    qualities = ["Thumb", "Low", "Medium", "High"];
  }else if(optimize){
    logger.log("Optimization enabled: Generating Thumb and High qualities");
    qualities = ["Thumb", "High"];
  }
  /** @fixme if we want to handle not-voyager-scenes, we should start here */
  if(!modelFiles.length) throw new Error(`No supported file: Can't create a scene`);

  const group = await tasks.group(async function *(tasks){
    for(let file of modelFiles){
      const ext = path.extname(file.name);
      const basename = path.basename(file.name, ext);
      const extname = ext.slice(1).toLowerCase();

      if(file.type === "model/gltf-binary" || extname === "glb"){
        logger.debug("Found a glb file: "+file.name);
        let model_id = uid();
        /** @fixme export raw glb file as Highest quality? */
        for(let quality of qualities){
          logger.debug("Create processing tasks for %s in quality %s", file.name, quality);
          const filename = `${basename}_${quality.toLowerCase()}.glb`;

          const do_optimize = (optimize /*|| quality != "High" /*We might want */);
          let optimizeTask:number|null = null;
          if(do_optimize){
            logger.log(`Optimize ${file.name} for quality ${quality}`);
            optimizeTask = await tasks.create({type: "transformGlb", data: {preset: quality, file: file.path}});
          }else{
            logger.debug("Model optimization is disabled");
          }

          let parse = await tasks.create({type: "inspectGlb", data: {file: optimizeTask?undefined:file.path}, after: optimizeTask?[ optimizeTask ]: null});

          let copy = await tasks.create({
            type: "copyFileTask",
            data: {
              scene: scene_id,
              name: filename,
              mime: "model/gltf-binary",
              user_id,
              file: optimizeTask?undefined: file.path,
            },
            after: optimizeTask?[optimizeTask]: null
          });

          yield await tasks.create({
            type: "groupOutputsTask",
            data: {
              id: model_id,
              quality,
              usage: "Web3D",
              filename,
              meta: `$[${parse}]`,
              size: `$[${copy}].size`
            },
            after: [parse, copy],
          });
        }
      }else{
        //This should not happen if we pre-filter models properly. Which we should because it then allows the task to fail early, with better reporting
        logger.error(`Unsupported file type: ${file.name} (${file.type})`);
      }
    }
    logger.debug("Tasks creation complete");
  });

  return await tasks.create({
    type: "createDocument",
    data: {
      name: scene_name,
      user_id,
      language,
    },
    after: [group],
  });
};




/**
 * Copy a temporary file into a scene
 */
export async function copyFileTask({task:{data: {file, ...params}}, inputs, context: {tasks, vfs, logger}}:TaskHandlerParams<WriteFileParams&{file?: string}>){
  if(!file) logger.debug("Searching inputs for a source file");
  const filepath = file ?? requireFileInput(inputs);
  logger.log(`Copy file from ${filepath} to ${params.scene}/${params.name}`);
  let f = await vfs.copyFile(filepath, params);
  return f;
}

interface UserUploadParams{
  size: number;
  filename: string;
}

interface UploadResult{
  filepath: string;
  files: string[];
  scenes: ImportSceneResult[];
}


/**
 * Handle a user-provided file
 * 
 * The upload should happen while the task is in `initializing` state.
 * Once done, the task is switched to `pending` state and the automated task processor will
 * perform a size check to try to catch corrupted uploads and a limited analysis of the uploaded file to detect potential use cases
 * 
 * @fixme should perform a hash verification when possible
 * 
 * @param param0 
 * @returns 
 */
export async function userUploads({task:{task_id, fk_user_id, data:{filename, size}}, inputs, context: {tasks, vfs, userManager, logger}}:TaskHandlerParams<UserUploadParams>){
  const dir = vfs.getTaskWorkspace(task_id);
  let files :string[] = [];

  const requester = await userManager.getUserById(fk_user_id);

  const filepath = path.join(dir, filename);

  const {size:diskSize}=  await stat(filepath);
  if(diskSize != size){
    throw new Error(`Expected a file of size ${size}, found ${diskSize}`);
  }

  const ext = extname(filename).toLowerCase();
  if(ext == ".zip"){
    logger.debug("Open zip file to list entries")
    let zip = await new Promise<ZipFile>((resolve,reject)=>yauzl.open(filepath, {lazyEntries: false, autoClose: true}, (err, zip)=>(err?reject(err): resolve(zip))));
    zip.on("entry", (record)=>{

      files.push(record.fileName); 
    });
    await once(zip, "close");
    logger.debug(`Found ${files.length} entries in zip`)
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
      const level = toAccessLevel(await userManager.getAccessRights(scene, fk_user_id));
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
  } satisfies UploadResult;
}


function taskIsUploadOutput(output: any): output is UploadResult {
    if(
      typeof output!== "object"
      || !output
      || typeof output.filepath !== "string"
      || !Array.isArray(output.files)
      || !Array.isArray(output.scenes)
    ) return false;
    return true;
}


/**
 * Process file(s) that have been uploaded through `userUploads` task(s).
 * The file(s) are expected to come from previous tasks' outputs
 */
export async function processUploadedFiles({inputs, context:{tasks, vfs, logger}}: TaskHandlerParams<{}>):Promise<number>{
  let uploads = [...inputs.entries()].map(([task_id, output])=>{
    if(! taskIsUploadOutput(output)) throw new BadRequestError(`Invalid input task ${task_id}: Output ${output} is not a valid file upload result`);
    return output;
  });
  if(!uploads.length) throw new BadRequestError(`This task requires at least one source file`);

  const upload_scenes =  uploads.findIndex(u=>u.scenes.length) !== -1 //A file containing at least one complete scene
  const upload_files = uploads.findIndex(u=>!u.scenes.length) !== -1 // A file NOT containing any complete scene
  // Don't allow mixed-content. ie. a scene archive with some asset files
  // In reality we _could_ probably, though we'd have to think carefully about edge cases?
  if( upload_scenes && upload_files ){
    throw new BadRequestError(`Can't do mixed-content processing. Provide EITHER scene archive(s) OR source file(s)`);
  }

  //Check that everything _should_ be error-free
  //We might still have fails because of race conditions or _things_, but it is preferable to have a preflight check
  const errors = uploads.map(u=>u.scenes.filter(s=>s.action === "error")).flat();
  for(let {error, name} of errors){
    logger.error(error  ?? `Unspecified error on scene ${name}`);
  }

  // @FIXME should we clean up some things immediately when we abort due to planned errors?
  if(errors.length){
    throw new UnauthorizedError(`Insufficient permissions on scene${1 < errors.length?"s":""} [${errors.slice(0, 3).map(({name})=>name)}${3 < errors.length?", ...":""}] for this user. Aborting.`);
  }

  return await tasks.group(async function* createChildren(context){
    for(let upload of uploads){
      if(upload_scenes){
        logger.debug("Extract uploaded scenes archive "+upload.filepath);
        yield context.create({type: "extractScenesArchive", data: {filepath: upload.filepath}});
      }
    }
  });
}