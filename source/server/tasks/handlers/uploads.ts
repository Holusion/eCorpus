import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";

import yauzl, { ZipFile } from "yauzl";
import { isUserAtLeast } from "../../auth/User.js";
import { toAccessLevel } from "../../auth/UserManager.js";
import { parseFilepath, isMainSceneFile } from "../../utils/archives.js";
import { FileArtifact, TaskDefinition, TaskHandlerParams } from "../types.js";
import { BadRequestError, InternalError } from "../../utils/errors.js";
import getDefaultDocument from "../../utils/schema/default.js";
import uid from "../../utils/uid.js";
import { toGlb } from "./toGlb.js";
import { getMimeType, isModelType, readMagicBytes } from "../../utils/filetypes.js";
import { IAsset, IModel, TDerivativeQuality, TDerivativeUsage } from "../../utils/schema/model.js";
import { optimizeGlb } from "./optimizeGlb.js";
import { IDocument } from "../../utils/schema/document.js";
import { inspectGlb } from "./inspectGlb.js";
import { Bounds } from "../../utils/gltf/inspect.js";



export interface ImportSceneResult{
  name: string;
  action: "create"|"update"|"error";
  error?: string;
}

export interface UploadHandlerParams{
  filename: string;
  size: number;
}

export interface UploadedFile extends FileArtifact{
  mime: string;
}

export interface UploadedArchive extends UploadedFile {
  mime: "application/zip";
  files: string[];
  scenes: ImportSceneResult[];
}

export interface UploadedBinaryModel extends UploadedFile {
  mime: "model/gltf-binary";
  isModel: boolean;
  name?: string;
  byteSize: number;
  numFaces: number;
  imageSize: number;
  bounds: Bounds | null;
}

export interface UploadedUsdModel extends UploadedFile{
  mime: "model/vnd.usdz+zip";
}

export interface UploadedSource extends UploadedFile{
  isModel: boolean;
}

export type ParsedUserUpload = UploadedArchive|UploadedBinaryModel|UploadedSource;


function isUploadedFile(output: any): output is UploadedFile{
  return typeof output === "object" && typeof output.fileLocation === "string" && typeof output.mime === "string";
}

function isUploadedBinaryModel(output: UploadedFile): output is UploadedBinaryModel{
  return isUploadedFile(output) && output.mime == "model/gltf-binary"
}

async function parseUploadedArchive({task:{task_id, user_id, data:{fileLocation}}, context: {vfs, userManager, logger}}:TaskHandlerParams<FileArtifact>):Promise<UploadedArchive>{
  const requester = await userManager.getUserById(user_id);
  const filename = path.basename(fileLocation);
  let files :string[] = [];
  logger.debug(`Open ${fileLocation} to list entries`);
  let zip = await new Promise<ZipFile>((resolve,reject)=>yauzl.open(vfs.absolute(fileLocation), {lazyEntries: false, autoClose: true}, (err, zip)=>(err?reject(err): resolve(zip))));
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
    mime: "application/zip",
    fileLocation,
    files: files,
    scenes
  };
}


async function parseUploadedModel({task: {data: {fileLocation}}, context: {logger, tasks, vfs}}:TaskHandlerParams<FileArtifact>):Promise<UploadedBinaryModel>{
  const filepath = vfs.absolute(fileLocation);
  logger.debug("Check mime type of "+fileLocation);
  const mime = await readMagicBytes(filepath);
  if(mime !== "model/gltf-binary"){
    throw new InternalError("This does not look like a GLB file");
  }
  const meta = await tasks.run({
    handler: inspectGlb,
    data: {fileLocation}
  });

  const stats = await fs.stat(filepath);

  logger.log(`Parsed glb file ${fileLocation}`);
  return {
    fileLocation,
    mime,
    isModel: true,
    name: meta.name,
    bounds: meta.bounds,
    imageSize: meta.imageSize,
    numFaces: meta.numFaces,
    byteSize: stats.size,
  }
}

/**
 * Inspect a user-uploaded file to detect its contents
 * @param param0 
 * @returns 
 */
export async function parseUserUpload({task:{task_id, user_id, data:{filename, size}}, context: {vfs, tasks, userManager, logger}}:TaskHandlerParams<UploadHandlerParams>):Promise<ParsedUserUpload>{
  const fileLocation = vfs.relative(path.join(vfs.getTaskWorkspace(task_id), filename));

  logger.debug(`Checking size of uploaded file ${fileLocation}`);
  let diskSize: number;
  try{
    const stats=  await fs.stat(vfs.absolute(fileLocation));
    diskSize = stats.size;
  }catch(e:any){
    if(e.code === "ENOENT"){
      logger.error(`File ${fileLocation} does not exist. Maybe it wasn't uploaded properly?`);
    }
    throw e;
  }
  if(diskSize != size){
    throw new Error(`Expected a file of size ${size}, found ${diskSize}`);
  }


  const mime = getMimeType(filename);

  if(mime === "application/zip"){
    return await tasks.run({
      data: { fileLocation },
      handler: parseUploadedArchive,
    });
  }else if (mime == "model/gltf-binary"){
    return await tasks.run({
      data: {fileLocation},
      handler: parseUploadedModel,
    });
  }else{
    return {
      mime,
      fileLocation,
      isModel: isModelType(filename),
    }
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
export async function createSceneFromFiles({context:{tasks, vfs, logger}, task: {user_id, task_id, data:{tasks:source_ids, name, language, options}}}: TaskHandlerParams<ProcessUploadedFilesParams>):Promise<number>{
  if(!user_id) throw new InternalError(`Can't create an anonymous scene. Provide a user`);
  if(!name) throw new BadRequestError(`Can't create a scene without a name`);
  if(!language) throw new BadRequestError(`Default language is required for scene creation`);
  if(!isSceneLanguage(language)) throw new BadRequestError(`Unsupported scene language ${language}`);
  if(!source_ids.length) throw new BadRequestError(`This task requires at least one source file`);

  for(const task_id of source_ids){
    if(!Number.isInteger(task_id)) throw new BadRequestError(`Invalid source task id: ${task_id}`);
  }
  const source_tasks = await Promise.all(source_ids.map(id=> tasks.getTask<UploadHandlerParams, ParsedUserUpload>(id)));
  const failed_tasks = source_tasks.filter(t=>t.status !== "success");
  const invalid_outputs = source_tasks.filter(t=>!isUploadedFile(t.output));
  if(failed_tasks.length) throw new BadRequestError(`Source task${1 < failed_tasks.length?"s":""} #${failed_tasks.map(t=>t.task_id).join(", #")} has not completed successfully`);
  if(invalid_outputs.length){
    for(let t of invalid_outputs){
      console.log(`Task ${t.type}#${t.task_id} can't be used as a scene source: Output is ${JSON.stringify(t.output)}`);
    }
    throw new BadRequestError(`Source task${1 < invalid_outputs.length?"s":""} ${invalid_outputs.map(t=>`${t.type}#${t.task_id}`).join(", ")} did not output a file`);
  }
  //If some source models are present, copy all files to the task's workspace
  let sources :Array<ParsedUserUpload> = source_tasks.map(t=>t.output);
  if(source_tasks.some(t=>(t.output as UploadedSource).isModel)){
    const dir = await vfs.createTaskWorkspace(task_id);
    sources = await Promise.all(source_tasks.map(async ({output})=>{
      const filepath = vfs.absolute(output.fileLocation);
      const dest = path.join(dir, path.basename(filepath));
      await fs.link(filepath, dest);
      return {
        ...output,
        fileLocation: vfs.relative(dest)
      } satisfies ParsedUserUpload;
    }));
  }

  const scene_id = await vfs.createScene(name, user_id);

  /**
   * Optimize the model if requested and perform the final move to its destination path
   */
  async function moveModel(source: UploadedBinaryModel){
    let filepath = vfs.absolute(source.fileLocation);
    let filename = path.basename(filepath);
    let mime = source.mime;
    if(options.optimize){
      const output = await tasks.run({
        data: {
          fileLocation: source.fileLocation,
          preset: "High",
        },
        handler: optimizeGlb,
      });
      if(typeof output.fileLocation !== "string") logger.warn("Model optimization output is unreadable : ", output);
      else{
        filepath = vfs.absolute(output.fileLocation);
        filename = path.basename(output.fileLocation);
        mime = "model/gltf-binary";
        logger.debug("Optimized model %s to %s", source.fileLocation, output.fileLocation);
      }
    }
    logger.debug("Copy %s to %s", filepath, filename);
    await vfs.copyFile(filepath, {scene: scene_id, name: filename, user_id, mime });
    models.push({
      ...(source as UploadedBinaryModel),
      uri: filename,
      quality: "High",
      usage: "Web3D"
    });
  }


  // @TODO: reparent everything to this task and this task to the created scene for better discoverability
  const models :Array<DocumentModel> = [];
  // We could probably return the scene ID from here and let this all be out-of-band
  for(let source of sources){
    let filepath = vfs.absolute(source.fileLocation);
    const filename = path.basename(filepath);
    if(source.mime === "application/zip"){
      logger.warn("in-scene Zip extraction is not yet implemented. Skipped.");
      continue;
    }else if(isUploadedBinaryModel(source)){
      await moveModel(source);
    }else if((source as UploadedSource).isModel){
      logger.log("Convert source model %s to GLB", source.fileLocation);
      const dest = await tasks.run({
        data: {fileLocation: vfs.relative(filepath)},
        handler: toGlb,
      });
      logger.debug("Copy Converted source file to %s", dest.fileLocation);

      const meta = await tasks.run({
        handler: parseUploadedModel,
        data: {
          fileLocation: dest.fileLocation,
        }
      });
      logger.debug("Parsed converted file :", meta);
      await moveModel(meta);
    }else{
      logger.debug("Copy source file %s (%s)", filepath, source.mime);
      const file = await vfs.copyFile(filepath, {scene: scene_id, name: filename, user_id, mime: source.mime });
      if(!file.hash) throw new BadRequestError(`File ${source.filepath} is empty`);
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

export interface DocumentModel {
  name?: string;
  /**
   * Uri is slightly misleading as it's "relative to scene root"
   * `uri` **WILL** be urlencoded by {@link createDocumentFromFiles} so it should be given in clear text
   */
  uri: string;
  byteSize: number;
  numFaces: number;
  imageSize: number;
  bounds: Bounds|null;
  quality:TDerivativeQuality;
  usage: TDerivativeUsage;
};

interface GetDocumentParams{
  scene :string;
  models :Array<DocumentModel>;
  language:SceneLanguage|undefined;
}



export async function createDocumentFromFiles(
  {
    task: {
      data:{scene, models, language = "EN"}
    },
  }: TaskHandlerParams<GetDocumentParams>): Promise<IDocument>{

  let document = getDefaultDocument();
  //dumb inefficient Deep copy because we want to mutate the doc in-place
  document.models ??= [];
  for(let model of models){
    const asset :IAsset = {
      "uri": encodeURIComponent(model.uri),
      "type": "Model",
    }
    for(const k of ["byteSize", "numFaces", "imageSize"]  as const){
      //Ignore values that does not match schema for those properties
      if(!Number.isInteger(model[k]) || model[k] < 1) continue;
      asset[k] = model[k];
    }
    const _m:IModel = {
      "units": "m", //glTF specification says it's always meters. It's what blender do.
      "derivatives":[{
        "usage": model.usage,
        "quality": model.quality,
        "assets": [asset]
      }],
      "annotations":[],
    }
    if(Array.isArray(model.bounds)){
      _m.boundingBox = model.bounds;
    }
    const index = document.models.push(_m) -1;
    const nodeIndex = document.nodes.push({
      "id": uid(),
      "name": model.name ?? scene,
      "model": index,
    } as any) -1;
    document.scenes[0].nodes!.push(nodeIndex);
  }
  

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

  return document
}
