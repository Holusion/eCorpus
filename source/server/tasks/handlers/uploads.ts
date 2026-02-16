import { once } from "node:events";
import { stat } from "node:fs/promises";
import path from "node:path";

import yauzl, { ZipFile } from "yauzl";
import { isUserAtLeast } from "../../auth/User.js";
import { toAccessLevel } from "../../auth/UserManager.js";
import { parseFilepath, isMainSceneFile } from "../../utils/archives.js";
import { TaskHandlerParams } from "../types.js";
import { BadRequestError, InternalError } from "../../utils/errors.js";
import getDefaultDocument from "../../utils/schema/default.js";
import { parse_glb } from "../../utils/glTF.js";
import uid from "../../utils/uid.js";
import { toGlb } from "./toGlb.js";
import { getMimeType } from "../../utils/filetypes.js";



export interface ImportSceneResult{
  name: string;
  action: "create"|"update"|"error";
  error?: string;
}

export interface UploadHandlerParams{
  filename: string;
  size: number;
}

export interface UploadedFile{
  filepath: string;
  mime: string;
}

export interface UnknownFileResult extends UploadedFile{
  filetype: "unknown";
}

export interface ParsedArchiveResult extends UploadedFile {
  filetype: "archive";
  files: string[];
  scenes: ImportSceneResult[];
}

export interface ParsedModelResult extends UploadedFile {
  filetype: "model";
  name?: string;
  byteSize: number;
  numFaces: number;
  imageSize: number;
  bounds: Awaited<ReturnType<typeof parse_glb>>["bounds"];
}

export interface ParsedSourceResult extends UploadedFile{
  filetype: "source";
}

export type ParsedUserUpload = UnknownFileResult|ParsedArchiveResult|ParsedModelResult|ParsedSourceResult;



async function parseUploadedArchive({task:{task_id, user_id, data:{filepath}}, context: {vfs, userManager, logger}}:TaskHandlerParams<{filepath: string}>):Promise<ParsedArchiveResult>{
  const requester = await userManager.getUserById(user_id);
  const filename = path.basename(filepath);
  let files :string[] = [];
  logger.debug(`Open ${filepath} to list entries`);
  let zip = await new Promise<ZipFile>((resolve,reject)=>yauzl.open(vfs.absolute(filepath), {lazyEntries: false, autoClose: true}, (err, zip)=>(err?reject(err): resolve(zip))));
  zip.on("entry", (record)=>{
    files.push(record.fileName); 
  });
  await once(zip, "close");

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
  return {
    filetype: "archive",
    mime: getMimeType(filepath),
    filepath,
    files: files,
    scenes
  };
}


async function parseUploadedModel({task: {data: {filepath}}, context: {logger, vfs}}:TaskHandlerParams<{filepath: string}>):Promise<ParsedModelResult>{
  
  const meta = await parse_glb(vfs.absolute(filepath));
  logger.log(`Parsed glb with ${meta.meshes.length} models`);
  logger.warn("Using placeholder imageSize: Not compatible with LOD mode");
  return {
    filepath,
    mime: getMimeType(filepath),
    filetype: "model",
    name: meta.meshes.find(m=>m.name)?.name,
    bounds: meta.bounds,
    byteSize: meta.byteSize,
    numFaces: meta.meshes.reduce((acc, m)=> acc+m.numFaces, 0),
    imageSize: 8192
  }
}

/**
 * Inspect a user-uploaded file to detect its contents
 * @param param0 
 * @returns 
 */
export async function parseUserUpload({task:{task_id, user_id, data:{filename, size}}, context: {vfs, tasks, userManager, logger}}:TaskHandlerParams<UploadHandlerParams>):Promise<ParsedUserUpload>{
  const filepath = vfs.relative(path.join(vfs.getTaskWorkspace(task_id), filename));

  logger.debug(`Checking size of uploaded file ${filepath}`);
  let diskSize: number;
  try{
    const stats=  await stat(vfs.absolute(filepath));
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


  const mime = getMimeType(filename);

  const nameslug = filename.toLowerCase();
  if(nameslug.endsWith(".zip")){
    return await tasks.run({
      data: { filepath },
      handler: parseUploadedArchive,
    });
  }else if (nameslug.endsWith(".glb")){
    return await tasks.run({
      data: {filepath},
      handler: parseUploadedModel,
    })
  }else if( /\.(?:obj|stl|ply)$/i.test(nameslug)){
    return {
      filepath,
      filetype: "source",
      mime,
    }
  }else{
    return {
      filepath,
      filetype: "unknown",
      mime,
    } satisfies UnknownFileResult;
  }

  // @FIXME maybe we should already delete the file if it has errors?
  // It depends on the behaviour we expect of a "partial success" zip upload.
}



export interface ProcessUploadedFilesParams{
  tasks: number[];
  name: string;
  language: string;
  options: {
    optimize?:boolean;
  }
}



const sceneLanguages = ["EN", "ES", "DE", "NL", "JA", "FR", "HAW"] as const;
type SceneLanguage = typeof sceneLanguages[number];
function isSceneLanguage(l:any) :l is SceneLanguage{
  return sceneLanguages.indexOf(l) !== -1;
}


/**
 * Process file(s) that have been uploaded through `userUploads` task(s).
 * The file(s) are expected to come from previous tasks
 */
export async function createSceneFromFiles({context:{tasks, vfs, logger}, task: {user_id, data:{tasks:source_ids, name, language, options}}}: TaskHandlerParams<ProcessUploadedFilesParams>):Promise<number>{
  if(!user_id) throw new InternalError(`Can't create an anonymous scene. Provide a user`);
  if(!name) throw new BadRequestError(`Can't create a scene without a name`);
  if(!language) throw new BadRequestError(`Default language is required for scene creation`);
  if(!isSceneLanguage(language)) throw new BadRequestError(`Unsupported scene language ${language}`);
  if(!source_ids.length) throw new BadRequestError(`This task requires at least one source file`);

  for(const task_id of source_ids){
    if(!Number.isInteger(task_id)) throw new BadRequestError(`Invalid source task id: ${task_id}`);
  }
  const source_tasks = await Promise.all(source_ids.map(id=> tasks.getTask<UploadHandlerParams, ParsedUserUpload>(id)));

  for (let task of source_tasks){
    if(task.status !== "success") throw new BadRequestError(`Source task #${task.task_id} has not completed successfully`);
  }

  const scene_id = await vfs.createScene(name, user_id);

  // @TODO: reparent everything to this task and this task to the created scene for better discoverability
  const models :Array<ParsedModelResult> = [];
  // We could probably return the scene ID from here and let this all be out-of-band
  for(let task of source_tasks){
    const {filename} = task.data;
    const {filepath, mime, filetype} = task.output;
    if(filetype === "archive"){
      logger.warn("in-scene Zip extraction is not yet implemented. Skipped.");
      continue;
    }

    if(filetype == "model"){
      if(options.optimize){
        logger.warn("Should optimize artifact");
      }
      logger.debug("Copy uploaded model %s to %s", filepath, filename);
      await vfs.copyFile(vfs.absolute(filepath), {scene: scene_id, name: filename, user_id, mime });
      models.push({...task.output as any, filepath: filename});
    }else if (filetype == "source"){
      logger.debug("Convert source file %s (%s)", filepath, mime);
      const dest = await tasks.run({
        data: {filepath},
        handler: toGlb,
      });
      logger.debug("Copy Converted source file to %s", dest);

      const meta = await tasks.run({
        handler: parseUploadedModel,
        data: {
          filepath: dest,
        }
      });
      logger.debug("Parsed converted file :", meta);

      const destname = path.basename(dest);
      await vfs.copyFile(vfs.absolute(dest), {scene: scene_id, name: destname, user_id, mime: meta.mime });
      models.push({...meta, filepath: destname});
    }else{
      logger.debug("Copy uploaded file %s to %s", filepath, filename);
      await vfs.copyFile(vfs.absolute(filepath), {scene: scene_id, name: filename, user_id, mime });
    }
  }

  logger.debug(`Create a new document for ${models.length} model${1 <models.length?"s":""}`);
  const doc = await tasks.run({
    scene_id: scene_id,
    data: {scene: name, models, language},
    handler: createDocumentFromFiles,
  });
  await vfs.writeDoc(JSON.stringify(doc), {scene: scene_id, user_id: user_id, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
  logger.debug(`Scene ${scene_id} initialized`);
  //TODO cleanup: unlink tasks artifacts
  return scene_id;
}

interface GetDocumentParams{
  scene :string;
  models :ParsedModelResult[];
  language?:SceneLanguage;
}



export async function createDocumentFromFiles(
  {
    task: {
      data:{scene, models, language}
    },
  }: TaskHandlerParams<GetDocumentParams>): Promise<any>{

  let document = getDefaultDocument();
  //dumb inefficient Deep copy because we want to mutate the doc in-place
  document.models ??= [];
  for(let model of models){
    const index = document.models.push({
      "units": "m", //glTF specification says it's always meters. It's what blender do.
      "boundingBox": model.bounds,
      "derivatives":[{
        "usage": "Web3D",
        "quality": "High",
        "assets": [
          {
            "uri": encodeURIComponent(model.filepath),
            "type": "Model",
            "byteSize": model.byteSize,
            "numFaces": model.numFaces,
            "imageSize": model.imageSize,
          }
        ]
      }],
      "annotations":[],
    }) -1;
    const nodeIndex = document.nodes.push({
      "id": uid(),
      "name": model.name ?? scene,
      "model": index,
    } as any) -1;
    document.scenes[0].nodes!.push(nodeIndex);
  }
  

  if(language){
    document.setups[0].language = {language: language};
    document.metas ??= [];
    const meta_index = document.metas.push({
      "collection": {
        "titles": {
          [language]: scene,
        }
      },
    }) -1;
    document.scenes[document.scene].meta = meta_index;
  }


  return document
}