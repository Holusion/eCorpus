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
import { createDocumentFromFiles, DocumentDerivative, DocumentModel } from "./createDocumentFromFiles.js";
import { isSceneLanguage } from "../../utils/languages.js";
import { TDerivativeQuality, TDerivativeUsage } from "../../utils/schema/model.js";
import { resolveInside, RootRelativePath } from "../../vfs/Base.js";

type HandlerContext = TaskHandlerParams["context"];



export interface ImportSceneResult {
  name: string;
  action: "create" | "update" | "error";
  error?: string;
}

export interface UploadHandlerParams {
  /**
   * Path of the upload's entry point, relative to its root.
   * Set when the upload is processed: an upload receiving its files has none yet.
   */
  main?: string;
}

/**
 * Where an upload stages its files, in its task's workspace:
 * - `incomplete`: files still being received
 * - `files`: complete files, with the folder structure they were sent with
 *
 * A file is moved from the first to the second once its last byte is received.
 */
export function getUploadStaging(vfs: { getTaskWorkspace(id: number): string }, id: number) {
  const workspace = vfs.getTaskWorkspace(id);
  return {
    incomplete: path.join(workspace, ".incomplete"),
    files: path.join(workspace, "files"),
  };
}

/**
 * Resolve a user-provided path of a file of an upload, while it's received and once it's complete.
 * `path` is the file's normalized path, relative to the upload's root, with `/` separators.
 * @throws {BadRequestError} if the path is outside of the upload
 */
export function getUploadFilePaths(vfs: { getTaskWorkspace(id: number): string }, id: number, filepath: string) {
  const staging = getUploadStaging(vfs, id);
  const complete = resolveInside(staging.files, filepath, "the upload");
  const rel = path.relative(staging.files, complete);
  return {
    path: rel.split(path.sep).join("/"),
    incomplete: path.join(staging.incomplete, rel),
    complete,
  };
}

/**
 * Paths of an upload's files that are still being received, relative to the upload's root.
 */
export async function listIncompleteUploadFiles(vfs: { getTaskWorkspace(id: number): string }, id: number): Promise<string[]> {
  const { incomplete } = getUploadStaging(vfs, id);
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(incomplete, { recursive: true, withFileTypes: true });
  } catch (e: any) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  return entries.filter(e => !e.isDirectory())
    .map(e => path.relative(incomplete, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .sort();
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
 * Inspect an upload's main file to detect its contents.
 * Its other files are beside it, in the upload's staging.
 */
export async function parseUserUpload({ task: { task_id, data: { main } }, context: { vfs, tasks, logger } }: TaskHandlerParams<UploadHandlerParams>): Promise<ParsedUserUpload> {
  if (typeof main !== "string" || !main) throw new BadRequestError(`Upload #${task_id} has no main file`);
  const { complete, path: filename } = getUploadFilePaths(vfs, task_id, main);
  const fileLocation = vfs.relative(complete);

  logger.debug(`Checking uploaded file ${fileLocation}`);
  const stats = await fs.stat(complete).catch((e) => {
    if (e.code !== "ENOENT") throw e;
    return null;
  });
  if (!stats?.isFile()) {
    throw new BadRequestError(`${filename} is not a complete file of upload #${task_id}`);
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
    /** Optimize the High quality model. Otherwise it is the uploaded model, as GLB. A Thumb is always made */
    optimize?: boolean;
  }
}

/** A model optimized with a quality's preset, ready to be copied into a scene */
interface OptimizedModel {
  fileLocation: RootRelativePath;
  byteSize: number;
  numFaces: number;
  imageSize: number;
  bounds: BoundingBox | null;
}

/**
 * Optimize a GLB with a quality's preset, and describe the result
 */
async function makeDerivativeFile(context: HandlerContext, glb: RootRelativePath, quality: TDerivativeQuality): Promise<OptimizedModel> {
  const { tasks, vfs } = context;
  const fileLocation = await optimizeModel(context, glb, quality);
  const meta = await tasks.run({
    handler: inspectGlb,
    data: { fileLocation },
  });
  const { size: byteSize } = await fs.stat(vfs.absolute(fileLocation));
  return {
    fileLocation,
    byteSize,
    numFaces: meta.numFaces,
    imageSize: meta.imageSize,
    bounds: meta.bounds,
  };
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
  //If some source models are present, link all files to the task's workspace
  //So they are locally available for references, in the folders they were uploaded with.
  //Files of different uploads are side by side: a model can refer to a file that was uploaded on its own.
  let sources: Array<ParsedUserUpload>;
  if (source_tasks.some(t => (t.output as UploadedSource).isModel)) {
    const dir = await vfs.createTaskWorkspace(task_id, true);
    logger.debug(`Import source file${1 < source_tasks.length?"s":""} from ${source_tasks.length} source${1 < source_tasks.length?"s":""}`);

    const link = async (src: string, rel: string) => {
      const dest = resolveInside(dir, rel, "the task's workspace");
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.link(src, dest);
      return dest;
    };

    //Main files first: they must not collide
    sources = [];
    for (const { task_id: source_id, data: { main }, output } of source_tasks) {
      const rel = main ?? path.basename(output.fileLocation);
      const dest = await link(vfs.absolute(output.fileLocation), rel).catch((e) => {
        if (e.code === "EEXIST" || e.code === "ENOTDIR") throw new BadRequestError(`Upload #${source_id}: another upload has a file named ${rel}`);
        throw e;
      });
      logger.debug(`hard-linked source ${rel} to task workspace`);
      sources.push({
        ...output,
        fileLocation: vfs.relative(dest)
      } satisfies ParsedUserUpload);
    }
    //Then the files they may refer to. The first one of a name wins.
    for (const { task_id: source_id, data: { main } } of source_tasks) {
      if (!main) continue;
      const { files } = getUploadStaging(vfs, source_id);
      const entries = await fs.readdir(files, { recursive: true, withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) continue;
        const src = path.join(entry.parentPath, entry.name);
        const rel = path.relative(files, src);
        if (rel.split(path.sep).join("/") === main) continue;
        await link(src, rel).catch((e) => {
          if (e.code !== "EEXIST" && e.code !== "ENOTDIR") throw e;
          logger.warn(`Upload #${source_id}: ${rel} is already provided by another upload`);
        });
      }
    }
  }else{
    sources = source_tasks.map(t => t.output);
  }

  const scene_id = await vfs.createScene(name, user_id);

  /**
   * Write a model's derivatives to the scene:
   * - High: the model, optimized if requested
   * - Thumb: always optimized, for the scene to show quickly
   */
  async function moveModel(source: UploadedBinaryModel) {
    const filename = path.basename(source.fileLocation);
    const derivatives: DocumentDerivative[] = [];
    const write = async (file: RootRelativePath, uri: string, mime: string) => {
      logger.debug("Copy %s to %s", file, uri);
      await vfs.copyFile(vfs.absolute(file), { scene: scene_id, name: uri, user_id, mime });
    };

    let high: Omit<OptimizedModel, "bounds"> = source;
    if (options.optimize) {
      high = await makeDerivativeFile(context, source.fileLocation, "High");
      logger.debug("Optimized model %s to %s", source.fileLocation, high.fileLocation);
    }
    await write(high.fileLocation, filename, "model/gltf-binary");
    derivatives.push({ uri: filename, usage: "Web3D", quality: "High", byteSize: high.byteSize, numFaces: high.numFaces, imageSize: high.imageSize });

    const thumb = await makeDerivativeFile(context, source.fileLocation, "Thumb");
    const thumbName = derivativeName(filename, "Thumb");
    await write(thumb.fileLocation, thumbName, "model/gltf-binary");
    derivatives.push({ uri: thumbName, usage: "Web3D", quality: "Thumb", byteSize: thumb.byteSize, numFaces: thumb.numFaces, imageSize: thumb.imageSize });

    models.push({ name: source.name, bounds: source.bounds, derivatives });
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

/** Qualities from lowest to highest, as Voyager ranks them when it picks a derivative */
const qualityRanks: readonly TDerivativeQuality[] = ["Thumb", "AR", "Low", "Medium", "High", "Highest"];

/**
 * Make derivatives of an uploaded model, in a scene: convert it to GLB if needed,
 * then optimize it with each quality's preset and write the results to the scene.
 * @param optimize when false, the highest quality is the model as it was uploaded (as GLB). The others are always optimized.
 */
async function makeUploadDerivatives(context: HandlerContext, { scene_id, user_id, upload, usage, qualities, optimize }: {
  scene_id: number | null | undefined,
  user_id: number | null | undefined,
  upload: number,
  usage: TDerivativeUsage,
  qualities: TDerivativeQuality[],
  optimize: boolean,
}): Promise<UploadDerivative[]> {
  const { tasks, vfs, logger } = context;
  if (!scene_id) throw new InternalError(`A derivative must be made in a scene. No scene_id provided`);
  if (typeof user_id !== "number") throw new InternalError(`A derivative requires an owner. No user_id provided`);
  if (usage !== "Web3D") throw new BadRequestError(`Unsupported derivative usage: ${usage}`);
  if (!qualities.length) throw new BadRequestError(`At least one derivative quality is required`);
  const unknown = qualities.filter(q => !qualityRanks.includes(q));
  if (unknown.length) throw new BadRequestError(`Unsupported derivative qualit${1 < unknown.length ? "ies" : "y"}: ${unknown.join(", ")}`);

  const [source_task] = await getSourceUploads(tasks, [upload], user_id);
  if (source_task.status !== "success" || !isUploadedFile(source_task.output)) {
    throw new BadRequestError(`Upload #${upload} has not completed successfully`);
  }

  //Converted once for all of them
  const glb = await toSourceGlb(context, source_task.output);
  const filename = source_task.data.main ?? path.basename(source_task.output.fileLocation);
  const sorted = [...new Set(qualities)].sort((a, b) => qualityRanks.indexOf(a) - qualityRanks.indexOf(b));
  const highest = sorted[sorted.length - 1];

  const derivatives: UploadDerivative[] = [];
  for (const quality of sorted) {
    const { fileLocation, ...meta } = (optimize || quality !== highest)
      ? await makeDerivativeFile(context, glb.fileLocation, quality)
      : glb;
    const uri = derivativeName(filename, quality);
    logger.debug("Copy %s to %s", fileLocation, uri);
    await vfs.copyFile(vfs.absolute(fileLocation), { scene: scene_id, name: uri, user_id, mime: "model/gltf-binary" });
    derivatives.push({
      uri,
      usage,
      quality,
      mime: "model/gltf-binary",
      byteSize: meta.byteSize,
      numFaces: meta.numFaces,
      imageSize: meta.imageSize,
      bounds: meta.bounds,
    });
  }
  return derivatives;
}

/**
 * Make a derivative of an uploaded model, in the task's scene:
 * convert it to GLB if needed, optimize it with the quality's preset, and write it to the scene.
 * Only Web3D derivatives are supported for now.
 */
export async function createUploadDerivative({ context, task: { scene_id, user_id, data: { upload, usage, quality } } }: TaskHandlerParams<UploadDerivativeParams>): Promise<UploadDerivative> {
  const [derivative] = await makeUploadDerivatives(context, { scene_id, user_id, upload, usage, qualities: [quality], optimize: true });
  return derivative;
}

export interface UploadDerivativesParams {
  /** Id of the upload the derivatives are made from */
  upload: number;
  usage: TDerivativeUsage;
  qualities: TDerivativeQuality[];
  /** When false, the highest quality is the model as it was uploaded. The others are always optimized. Defaults to true */
  optimize?: boolean;
}

/**
 * Make several derivatives of an uploaded model, in the task's scene, converting it only once.
 * With `optimize: false`, the highest quality is the model as uploaded: one can send a model that's ready,
 * or a Thumb one made oneself, and have it used as is.
 * @returns the derivatives, from lowest to highest quality
 */
export async function createUploadDerivatives({ context, task: { scene_id, user_id, data: { upload, usage, qualities, optimize = true } } }: TaskHandlerParams<UploadDerivativesParams>): Promise<{ derivatives: UploadDerivative[] }> {
  if (!Array.isArray(qualities)) throw new BadRequestError(`qualities must be a list of derivative qualities`);
  return { derivatives: await makeUploadDerivatives(context, { scene_id, user_id, upload, usage, qualities, optimize: optimize !== false }) };
}
