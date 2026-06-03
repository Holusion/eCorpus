import { Readable } from "node:stream";
import { once } from "node:events";
import { FileArtifact, TaskHandlerParams } from "../types.js";
import yauzl, { Entry, ZipFile } from "yauzl";
import path from "node:path";
import { isUserAtLeast } from "../../auth/User.js";
import { BadRequestError, HTTPError, InternalError, UnauthorizedError } from "../../utils/errors.js";
import { parseFilepath } from "../../utils/archives.js";
import { toAccessLevel } from "../../auth/UserManager.js";
import { getMimeType } from "../../utils/filetypes.js";
import { finished } from "node:stream/promises";
import { UploadHandlerParams, ParsedUserUpload, UploadedArchive, UploadedFile } from "./uploads.js";



export interface ImportSuccessResult{
  name: string;
  action: "create"|"update";
}
interface ImportErrorResult{
  name: string;
  action: "error";
  error: HTTPError|Error;
}
type ImportSceneResult = ImportSuccessResult|ImportErrorResult;


/**
 * Analyze an uploaded file and create child tasks accordingly
 */
export async function extractScenesArchive({task: {scene_id: scene_id, user_id: user_id, data: {fileLocation}}, context:{vfs, logger, userManager, tasks, signal}}:TaskHandlerParams<FileArtifact>):Promise<ImportSuccessResult[]>{
  if(!fileLocation || typeof fileLocation !== "string") throw new Error(`invalid fileLocation provided`);
  const filepath = vfs.absolute(fileLocation);
  if(!user_id) throw new Error(`This task requires an authenticated user`);
  const requester = await userManager.getUserById(user_id);

  let zipError: Error;
  logger.debug("Open Zip file");
  const zip = await new Promise<ZipFile>((resolve,reject)=>yauzl.open(filepath, {lazyEntries: true, autoClose: true}, (err, zip)=>(err?reject(err): resolve(zip))));
  const openZipEntry = (record:Entry)=> new Promise<Readable>((resolve, reject)=>zip.openReadStream(record, (err, rs)=>(err?reject(err): resolve(rs))));
    
  logger.debug("Open database transaction");
  const ts = Date.now();
  try{
  // Pass the abort signal into the transaction: once cancelled, the next query throws and the
  // whole transaction rolls back, neutralizing any further writes from this handler.
  const results = await vfs.isolate(async (vfs)=>{
    //Directory entries are optional in a zip file so we should handle their absence
    //We do this by maintaining a Map of scenes, and for each scene a Set of files
    let scenes = new Map<string, ImportSceneResult &{folders: Set<string>}>();
    // As soon as we have one or more errors, we skip trying to copy files
    // but we continue processing entries to get a list of all unauthorized scenes
    let has_errors = false;
    /**
     * Handles a zip entry.
     */
    const onEntry = async (record :Entry) =>{
      // cooperative cancellation: stop before doing any work on this entry once aborted
      if(signal?.aborted) throw signal.reason ?? new Error("Task aborted");
      const {scene, name, isDirectory} = parseFilepath(record.fileName);
      if(!scene ) return;
      if(!scenes.has(scene)){
        let result:ImportSceneResult;
        //Create the scene
        try{
          const rights = await userManager.getAccessRights(scene, requester.uid)
          if(toAccessLevel("write") <= toAccessLevel(rights)){
            result = {name: scene, action: "update"};
            logger.log(`Scene ${scene} will be updated`);
          }else{
            logger.warn(`Scene ${scene} can't be updated: User only has access level "${toAccessLevel(rights)}"`);
            result = {name: scene, action: "error", error: new UnauthorizedError(`User doesn't have write permissions on scene "${scene}"`)};
            has_errors = true;
          }
        }catch(e){
          if((e as HTTPError).code != 404) throw e;
          //404 == Not Found. Check if user can create the scene
          if (isUserAtLeast(requester, "create")) {
            await vfs.createScene(scene, requester.uid);
            result = {name: scene, action: "create"};
            logger.log(`Scene ${scene} will be created`);
          }else{
            result = {name: scene, action: "error", error: new UnauthorizedError(`User doesn't have write permissions on scene "${scene}"`)};
            has_errors = true;
          }
        }
        scenes.set(scene, {folders: new Set(), ...result});
      }
      //Don't create the files if any scene is rejected: The transaction will be reverted anyways
      if(has_errors) return; 

      const _s = scenes.get(scene); //having a scene not registered in this map is not supposed to happen. Something would be seriously wrong
      if(!_s || _s.action === "error") throw new Error(`Scene ${scene} wasn't properly checked for permissions`);



      // Proceed with content creation. Start with folders
      // We have to manually re-create the structure because folder entries are optional in zip archives
      const { folders } = _s;
      if (!name) return;
      let dirpath = "";
      let pathParts = name.split("/");
      if(!isDirectory) pathParts.pop(); //Remove last segment except for directories
      while(pathParts.length){
        dirpath = path.join(dirpath, pathParts.shift()!);
        if(folders.has(dirpath)) continue;
        folders.add(dirpath);
        try{
          await vfs.createFolder({scene, name: dirpath, user_id: requester.uid});
        }catch(e){
          if((e as HTTPError).code != 409) throw e;
          //409 == Folder already exist, it's OK.
        }
      }
      // Is a directory. Do nothing, handled above.
      if(isDirectory) return;

      let mime = getMimeType(name);
      logger.debug(`Open zip entry ${record.fileName} (${mime})`);
      let rs = await openZipEntry(record);
      if(mime == "application/si-dpo-3d.document+json" || mime.startsWith('text/')){
        logger.debug("casting %s/%s from stream to string", scene, name);
        let data = Buffer.allocUnsafe(record.uncompressedSize), size = 0;
        rs.on("data", (chunk: Buffer)=>{
          data.set(chunk, size);
          size += chunk.length;
        });
        await finished(rs, { signal });
        //Check size because we alloc'd unsafe
        if(size != record.uncompressedSize){
          logger.error(`${record.fileName} has ${size} bytes of data (expected ${record.uncompressedSize})`);
          throw new Error(`Corrupted or truncated Zip file: Bad file size for ${record.fileName}`);
        }
        await vfs.writeDoc(data, {scene, user_id: requester.uid, name, mime });
      }else{
        await vfs.writeFile(rs, {user_id: requester.uid, scene, name, mime, signal});
      }
    };

    zip.on("entry", (record)=>{
      onEntry(record).then(()=>{
        zip.readEntry();
      }, (e)=>{
        logger.log("Closing the zip file early due to a readEntry error");
        zip.close();
        zipError=e;
      });
    });
    zip.readEntry();

    logger.debug("Start extracting zip entries");
    await once(zip, "close", { signal });

    if(zipError){
      logger.error("Zip extraction encountered an error. This is most probably due to an invalid zip");
      throw zipError;
    }

    const results = [...scenes.values()].map<ImportSceneResult>(({folders, ...r})=> r as any);
    if(has_errors){
      let errors = results.filter(function(r):r is ImportErrorResult {return r.action == "error"});
      if(errors.length == 1){
        throw errors[0].error;
      }else {
        let unauthorized = errors.filter(r=>r.error instanceof UnauthorizedError);
        if(unauthorized.length === errors.length){
          throw new  UnauthorizedError(
            `Multiple unauthorized scenes : ${errors.map(r=>r.name).join(",")}`
          );
        } else {
          throw new InternalError(`Mixed errors : ${errors.map(r=>r.error.message).join(", ")}`)
        }
      }
    }else{
      logger.debug("zip file closed successfully. Running database triggers.");
      return results as ImportSuccessResult[];
    }
  }, { signal });

  logger.log("Database transaction took %dms", Date.now()- ts);
  return results;
  }finally{
    // Release the zip fd even if we bailed out before yauzl auto-closed (e.g. on cancellation).
    // ZipFile.close() is idempotent, so this is a no-op after a normal, fully-consumed run.
    zip.close();
  }
};

export function isUploadedArchive(t: UploadedFile): t is UploadedArchive {
  return t.mime == "application/zip" && (t as any).scenes?.length;
}

export async function extractScenesArchives({ context: { tasks, logger }, task: { data: { tasks: source_ids } } }: TaskHandlerParams<{ tasks: number[]; }>): Promise<ImportSuccessResult[]> {
  if (!source_ids.length) throw new BadRequestError(`This task requires at least one source file`);

  for (const task_id of source_ids) {
    if (!Number.isInteger(task_id)) throw new BadRequestError(`Invalid source task id: ${task_id}`);
  }
  const source_tasks = await Promise.all(source_ids.map(id => tasks.getTask<UploadHandlerParams, ParsedUserUpload>(id)));
  const failed_tasks = source_tasks.filter(t => t.status !== "success");
  const invalid_outputs = source_tasks.filter(t => !isUploadedArchive(t.output));
  if (failed_tasks.length) throw new BadRequestError(`Source task${1 < failed_tasks.length ? "s" : ""} ${failed_tasks.map(t => t.task_id).join(", ")} has not completed successfully`);
  if (invalid_outputs.length) throw new BadRequestError(`Source task${1 < invalid_outputs.length ? "s" : ""} ${invalid_outputs.map(t => t.task_id).join(", ")} did not output a zip file`);

  const archives = source_tasks.map(t => t.output as UploadedArchive);
  // Unfortunately here it's possible to have partial failures if we have more than one file.
  // it could be prevented with async-context support for database transactions
  if(1 < archives.length) logger.warn(`Importing more than once archive file. Partial failures are possible`);

  let results = [];
  for (let archive of archives) {
    results.push(...await tasks.run({
      handler: extractScenesArchive,
      data: {
        fileLocation: archive.fileLocation,
      }
    }));
  }
  return results;
}

