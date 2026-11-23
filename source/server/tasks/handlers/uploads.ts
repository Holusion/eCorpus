import { once } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";

import yauzl, { ZipFile } from "yauzl";
import { isUserAtLeast } from "../../auth/User.js";
import { AccessLevel } from "../../auth/UserManager.js";
import { parseFilepath, isMainSceneFile } from "../../utils/archives.js";
import { FileArtifact, TaskHandlerParams } from "../types.js";
import { BadRequestError, InternalError, UnauthorizedError } from "../../utils/errors.js";
import { localize, LocalizedOutput } from "../../utils/i18n.js";
import { toGlb } from "./toGlb.js";
import { getMimeType, isModelType, readMagicBytes } from "../../utils/filetypes.js";
import { optimizeGlb } from "./optimizeGlb.js";
import { inspectGlb } from "./inspectGlb.js";
import { BoundingBox } from "../../utils/gltf/inspect.js";
import { createDocumentFromFiles, DocumentModel } from "./createDocumentFromFiles.js";
import { isSceneLanguage } from "../../utils/languages.js";
import { TDerivativeQuality, TDerivativeUsage } from "../../utils/schema/model.js";
import { RootRelativePath } from "../../vfs/Base.js";

type HandlerContext = TaskHandlerParams["context"];



export interface ImportSceneResult {
  name: string;
  action: "create" | "update" | "error";
  error?: string;
}

export interface UploadHandlerParams {
  filename: string;
  size: number;
}

export interface UploadedFile extends FileArtifact {
  mime: string;
}

export interface UploadedArchive extends UploadedFile {
  mime: "application/zip";
  files: string[];
  scenes: ImportSceneResult[];
}

export interface UploadedBinaryModel extends UploadedFile, Required<LocalizedOutput> {
  mime: "model/gltf-binary";
  isModel: boolean;
  name?: string;
  byteSize: number;
  numFaces: number;
  imageSize: number;
  bounds: BoundingBox | null;
}

export interface UploadedUsdModel extends UploadedFile {
  mime: "model/vnd.usdz+zip";
}

export interface UploadedSource extends UploadedFile {
  isModel: boolean;
}

export type ParsedUserUpload = UploadedArchive | UploadedBinaryModel | UploadedSource;


function isUploadedFile(output: any): output is UploadedFile {
  return typeof output === "object" && typeof output.fileLocation === "string" && typeof output.mime === "string";
}

function isUploadedBinaryModel(output: UploadedFile): output is UploadedBinaryModel {
  return isUploadedFile(output) && output.mime == "model/gltf-binary"
}

async function parseUploadedArchive({ task: { task_id, user_id, data: { fileLocation } }, context: { vfs, userManager, logger } }: TaskHandlerParams<FileArtifact>): Promise<UploadedArchive> {
  if(typeof user_id !== "number") throw new Error("File upload require an owner. No user_id provided");
  const requester = await userManager.getUserById(user_id);
  const filename = path.basename(fileLocation);
  let files: string[] = [];
  logger.debug(`Open ${fileLocation} to list entries`);
  let zip = await new Promise<ZipFile>((resolve, reject) => yauzl.open(vfs.absolute(fileLocation), { lazyEntries: false, autoClose: true }, (err, zip) => (err ? reject(err) : resolve(zip))));
  zip.on("entry", (record) => {
    files.push(record.fileName);
  });
  await once(zip, "close");

  let scenes: ImportSceneResult[] = [];
  for (let file of files) {
    const { scene, name } = parseFilepath(file);
    if (!scene || !name || !isMainSceneFile(file)) continue;
    let action: "create" | "update" | "error";
    let error: string;
    try {
      const level = await userManager.getAccessRights(scene, user_id);
      if (level < AccessLevel.Write) {
        action = "error";
        error = `User doesn't have write permissions on scene ${scene}`;
      } else {
        action = "update";
      }
    } catch (e: any) {
      if (e.code !== 404) throw e;
      if (isUserAtLeast(requester, "create")) {
        action = "create"
      } else {
        action = "error";
        error = "User doesn't have permission to create a new scene";
      }
    }
    scenes.push({ name: scene, action, error: error! });
  }
  return {
    mime: "application/zip",
    fileLocation,
    files: files,
    scenes
  };
}


async function parseUploadedModel({ task: { data: { fileLocation } }, context: { logger, tasks, vfs } }: TaskHandlerParams<FileArtifact>): Promise<UploadedBinaryModel> {
  const filepath = vfs.absolute(fileLocation);
  logger.debug("Check mime type of " + fileLocation);
  const mime = await readMagicBytes(filepath);
  if (mime !== "model/gltf-binary") {
    throw new InternalError(localize("errors.upload.notGlb", { filename: path.basename(fileLocation) }));
  }
  const meta = await tasks.run({
    handler: inspectGlb,
    data: { fileLocation }
  }).catch((e) => {
    throw new InternalError(localize("errors.upload.invalidGlb", { filename: path.basename(fileLocation), reason: e.message }));
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
    warnings: meta.warnings,
    messages: meta.messages,
    byteSize: stats.size,
  }
}

/**
 * Inspect a user-uploaded file to detect its contents
 * @param param0 
 * @returns 
 */
export async function parseUserUpload({ task: { task_id, user_id, data: { filename, size } }, context: { vfs, tasks, userManager, logger } }: TaskHandlerParams<UploadHandlerParams>): Promise<ParsedUserUpload> {
  const fileLocation = vfs.relative(vfs.getTaskFilePath(task_id, filename));

  logger.debug(`Checking size of uploaded file ${fileLocation}`);
  let diskSize: number;
  try {
    const stats = await fs.stat(vfs.absolute(fileLocation));
    diskSize = stats.size;
  } catch (e: any) {
    if (e.code === "ENOENT") {
      logger.error(`File ${fileLocation} does not exist. Maybe it wasn't uploaded properly?`);
    }
    throw e;
  }
  if (diskSize != size) {
    throw new Error(`Expected a file of size ${size}, found ${diskSize}`);
  }


  const mime = getMimeType(filename);

  if (mime === "application/zip") {
    return await tasks.run({
      data: { fileLocation },
      handler: parseUploadedArchive,
    });
  } else if (mime == "model/gltf-binary") {
    return await tasks.run({
      data: { fileLocation },
      handler: parseUploadedModel,
    });
  } else {
    return {
      mime,
      fileLocation,
      isModel: isModelType(filename),
    }
  }

  // @FIXME maybe we should already delete the file if it has errors?
  // It depends on the behaviour we expect of a "partial success" zip upload.
}



/**
 * A GLB made from an uploaded model: the upload itself if it already is one, else its conversion.
 * @throws {BadRequestError} if the upload is not a model
 */
async function toSourceGlb({ tasks, logger }: HandlerContext, source: ParsedUserUpload): Promise<UploadedBinaryModel> {
  if (isUploadedBinaryModel(source)) return source;
  if (!(source as UploadedSource).isModel) {
    throw new BadRequestError(localize("errors.upload.notAModel", { filename: path.basename(source.fileLocation) }));
  }
  logger.log("Convert source model %s to GLB", source.fileLocation);
  const dest = await tasks.run({
    data: { fileLocation: source.fileLocation },
    handler: toGlb,
  });
  const meta = await tasks.run({
    handler: parseUploadedModel,
    data: { fileLocation: dest.fileLocation },
  });
  logger.debug("Parsed converted file :", meta);
  return meta;
}

/**
 * Optimize a GLB with a quality preset
 * @returns the optimized file's location
 */
async function optimizeModel({ tasks }: HandlerContext, fileLocation: RootRelativePath, preset: TDerivativeQuality): Promise<RootRelativePath> {
  const output = await tasks.run({
    data: { fileLocation, preset },
    handler: optimizeGlb,
  }).catch((e: Error) => {
    //What went wrong is meshtinker's: it's only in english
    throw new InternalError(localize("errors.upload.optimizeFailed", { filename: path.basename(fileLocation), reason: e.message }));
  });
  if (typeof output?.fileLocation !== "string") throw new InternalError(`Model optimization output is unreadable: ${JSON.stringify(output)}`);
  return output.fileLocation;
}

/**
 * Fetch the upload tasks a task was given as sources.
 * Source ids are user-provided: they must all be tasks owned by the same user.
 */
export async function getSourceUploads(tasks: TaskHandlerParams["context"]["tasks"], source_ids: unknown, user_id: number | null) {
  if (typeof user_id !== "number") throw new InternalError(`Source files require an owner. No user_id provided`);
  if (!Array.isArray(source_ids) || !source_ids.length) throw new BadRequestError(`This task requires at least one source file`);
  for (const task_id of source_ids) {
    if (!Number.isInteger(task_id)) throw new BadRequestError(`Invalid source task id: ${task_id}`);
  }
  const source_tasks = await Promise.all(source_ids.map((id: number) => tasks.getTask<UploadHandlerParams, ParsedUserUpload>(id)));
  const foreign_tasks = source_tasks.filter(t => t.user_id !== user_id);
  if (foreign_tasks.length) throw new UnauthorizedError(`Source task${1 < foreign_tasks.length ? "s" : ""} #${foreign_tasks.map(t => t.task_id).join(", #")} does not belong to this user`);
  return source_tasks;
}

export interface ProcessUploadedFilesParams {
  tasks: number[];
  name: string;
  language: string;
  options: {
    optimize?: boolean;
  }
}


/**
 * Process file(s) that have been uploaded through `userUploads` task(s).
 * The file(s) are expected to come from previous tasks
 */
export async function createSceneFromFiles({ context, task: { user_id, task_id, data: { tasks: source_ids, name, language, options } } }: TaskHandlerParams<ProcessUploadedFilesParams>): Promise<number> {
  const { tasks, vfs, logger } = context;
  if (!user_id) throw new InternalError(`Can't create an anonymous scene. Provide a user`);
  if (!name) throw new BadRequestError(`Can't create a scene without a name`);
  if (!language) throw new BadRequestError(`Default language is required for scene creation`);
  if (!isSceneLanguage(language)) throw new BadRequestError(`Unsupported scene language ${language}`);

  const source_tasks = await getSourceUploads(tasks, source_ids, user_id);
  const failed_tasks = source_tasks.filter(t => t.status !== "success");
  const invalid_outputs = source_tasks.filter(t => !isUploadedFile(t.output));
  if (failed_tasks.length) throw new BadRequestError(`Source task${1 < failed_tasks.length ? "s" : ""} #${failed_tasks.map(t => t.task_id).join(", #")} has not completed successfully`);
  if (invalid_outputs.length) {
    for (let t of invalid_outputs) {
      logger.log(`Task ${t.type}#${t.task_id} can't be used as a scene source: Output is ${JSON.stringify(t.output)}`);
    }
    throw new BadRequestError(`Source task${1 < invalid_outputs.length ? "s" : ""} ${invalid_outputs.map(t => `${t.type}#${t.task_id}`).join(", ")} did not output a file`);
  }
  //If some source models are present, copy all files to the task's workspace
  //So they are locally available for references
  let sources: Array<ParsedUserUpload>;
  if (source_tasks.some(t => (t.output as UploadedSource).isModel)) {
    const dir = await vfs.createTaskWorkspace(task_id, true);
    logger.debug(`Import source file${1 < source_tasks.length?"s":""} from ${source_tasks.length} source${1 < source_tasks.length?"s":""}`);

    let _files = await fs.readdir(dir);
    if(_files.length) logger.warn(`Task workspace  ${dir} contains : `, _files);

    sources = []
    for(let {output} of source_tasks){
      const srcFile = vfs.absolute(output.fileLocation);
      const dest = path.join(dir, path.basename(srcFile));
      logger.debug(`hard-link source model ${srcFile} to task workspace`);
      await fs.link(srcFile, dest);
      logger.debug(`hard-linked source model ${srcFile} to task workspace`);
      sources.push({
        ...output,
        fileLocation: vfs.relative(dest)
      } satisfies ParsedUserUpload);
    }
  }else{
    sources = source_tasks.map(t => t.output);
  }

  const scene_id = await vfs.createScene(name, user_id);

  /**
   * Optimize the model if requested and perform the final move to its destination path
   */
  async function moveModel(source: UploadedBinaryModel) {
    let filepath = vfs.absolute(source.fileLocation);
    let filename = path.basename(filepath);
    let mime = source.mime;
    if (options.optimize) {
      const fileLocation = await optimizeModel(context, source.fileLocation, "High");
      filepath = vfs.absolute(fileLocation);
      filename = path.basename(fileLocation);
      mime = "model/gltf-binary";
      logger.debug("Optimized model %s to %s", source.fileLocation, fileLocation);
    }
    logger.debug("Copy %s to %s", filepath, filename);
    await vfs.copyFile(filepath, { scene: scene_id, name: filename, user_id, mime });
    models.push({
      ...(source as UploadedBinaryModel),
      uri: filename,
      quality: "High",
      usage: "Web3D"
    });
  }

  await tasks.setTaskScene(task_id, scene_id);
  logger.debug("Reparent source tasks");
  for(let source_task of source_tasks){
    if(source_task.parent){
      logger.warn(`Source task ${source_task.task_id} is already a child of ${source_task.parent}. Skipping`);
    }
    //Will retroactively set scene_id too.
    await tasks.setTaskParent(source_task.task_id, task_id);
  }

  const models: Array<DocumentModel> = [];
  // We could probably return the scene ID from here and let this all be out-of-band
  for (let source of sources) {
    let filepath = vfs.absolute(source.fileLocation);
    const filename = path.basename(filepath);
    if (source.mime === "application/zip") {
      logger.warn("in-scene Zip extraction is not yet implemented. Skipped.");
      continue;
    } else if (isUploadedBinaryModel(source) || (source as UploadedSource).isModel) {
      await moveModel(await toSourceGlb(context, source));
    } else {
      logger.debug("Copy source file %s (%s)", filepath, source.mime);
      const file = await vfs.copyFile(filepath, { scene: scene_id, name: filename, user_id, mime: source.mime });
      if (!file.hash) throw new BadRequestError(`File ${source.filepath} is empty`);
    }
  }

  logger.debug(`Create a new document for ${models.length} model${1 < models.length ? "s" : ""}`);
  const doc = await tasks.run({
    scene_id: scene_id,
    data: { scene: name, models, language },
    handler: createDocumentFromFiles,
  });
  await vfs.writeDoc(JSON.stringify(doc), { scene: scene_id, user_id: user_id, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json" });
  logger.debug(`Scene ${scene_id} initialized`);
  //TODO cleanup: unlink tasks artifacts
  return scene_id;
}



export interface UploadDerivativeParams {
  /** Id of the upload the derivative is made from */
  upload: number;
  usage: TDerivativeUsage;
  quality: TDerivativeQuality;
}

export interface UploadDerivative {
  /** Name of the derivative's file, in the scene */
  uri: string;
  usage: TDerivativeUsage;
  quality: TDerivativeQuality;
  mime: "model/gltf-binary";
  byteSize: number;
  numFaces: number;
  imageSize: number;
  bounds: BoundingBox | null;
}

/**
 * Name of the scene file holding an upload's derivative.
 * It is deterministic: making the same derivative again writes a new version of the same file.
 * @param filename the upload's file name
 */
export function derivativeName(filename: string, quality: TDerivativeQuality): string {
  const base = path.basename(filename).replace(/\.[^.]*$/, "") || "model";
  return `${base}-${quality.toLowerCase()}.glb`;
}

/**
 * Make a derivative of an uploaded model, in the task's scene:
 * convert it to GLB if needed, optimize it with the quality's preset, and write it to the scene.
 * Only Web3D derivatives are supported for now.
 */
export async function createUploadDerivative({ context, task: { scene_id, user_id, data: { upload, usage, quality } } }: TaskHandlerParams<UploadDerivativeParams>): Promise<UploadDerivative> {
  const { tasks, vfs, logger } = context;
  if (!scene_id) throw new InternalError(`A derivative must be made in a scene. No scene_id provided`);
  if (typeof user_id !== "number") throw new InternalError(`A derivative requires an owner. No user_id provided`);
  if (usage !== "Web3D") throw new BadRequestError(`Unsupported derivative usage: ${usage}`);

  const [source_task] = await getSourceUploads(tasks, [upload], user_id);
  if (source_task.status !== "success" || !isUploadedFile(source_task.output)) {
    throw new BadRequestError(`Upload #${upload} has not completed successfully`);
  }

  const glb = await toSourceGlb(context, source_task.output);
  const fileLocation = await optimizeModel(context, glb.fileLocation, quality);
  const meta = await tasks.run({
    handler: inspectGlb,
    data: { fileLocation },
  });

  const uri = derivativeName(source_task.data.filename, quality);
  logger.debug("Copy %s to %s", fileLocation, uri);
  const filepath = vfs.absolute(fileLocation);
  await vfs.copyFile(filepath, { scene: scene_id, name: uri, user_id, mime: "model/gltf-binary" });
  const { size: byteSize } = await fs.stat(filepath);
  return {
    uri,
    usage,
    quality,
    mime: "model/gltf-binary",
    byteSize,
    numFaces: meta.numFaces,
    imageSize: meta.imageSize,
    bounds: meta.bounds,
  };
}
