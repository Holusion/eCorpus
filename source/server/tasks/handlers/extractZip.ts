import { Readable } from "node:stream";
import { once } from "node:events";
import { TaskHandlerParams } from "../types.js";
import yauzl, { Entry, ZipFile } from "yauzl";
import path from "node:path";
import { isUserAtLeast } from "../../auth/User.js";
import { BadRequestError, HTTPError, InternalError, UnauthorizedError } from "../../utils/errors.js";
import { parseFilepath } from "../../utils/archives.js";
import { toAccessLevel } from "../../auth/UserManager.js";
import { getMimeType } from "../../utils/filetypes.js";
import { text } from "node:stream/consumers";
import { finished } from "node:stream/promises";



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

interface ExtractZipParams{
  /**filepath, relative to Vfs.baseDir */
  filepath: string,
}

/**
 * Analyze an uploaded file and create child tasks accordingly
 */
export async function extractScenesArchive({task: {scene_id: scene_id, user_id: user_id, data: {filepath}}, context:{vfs, logger, userManager, tasks}}:TaskHandlerParams<ExtractZipParams>):Promise<ImportSuccessResult[]>{
  if(!filepath || typeof filepath !== "string") throw new Error(`invalid filepath provided`);

  if(!user_id) throw new Error(`This task requires an authenticated user`);
  const requester = await userManager.getUserById(user_id);

  let zipError: Error;
  logger.debug("Open Zip file");
  const zip = await new Promise<ZipFile>((resolve,reject)=>yauzl.open(path.join(vfs.baseDir, filepath!), {lazyEntries: true, autoClose: true}, (err, zip)=>(err?reject(err): resolve(zip))));
  const openZipEntry = (record:Entry)=> new Promise<Readable>((resolve, reject)=>zip.openReadStream(record, (err, rs)=>(err?reject(err): resolve(rs))));
    
  logger.debug("Open database transaction");
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
      if(has_errors) return;
      const _s = scenes.get(scene);
      if(!_s || _s.action === "error") throw new Error(`Scene ${scene} wasn't properly checked for permissions`);
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

      if(isDirectory){
        // Is a directory. Do nothing, handled above.
      }else if(name.endsWith(".svx.json")){
        let data = Buffer.alloc(record.uncompressedSize), size = 0;
        let rs = await openZipEntry(record);
        rs.on("data", (chunk)=>{
          chunk.copy(data, size);
          size += chunk.length;
        });
        await finished(rs);
        await vfs.writeDoc(data, {scene, user_id: requester.uid, name, mime: "application/si-dpo-3d.document+json"});
      }else{
        //Add the file
        let rs = await openZipEntry(record);
        let mime = getMimeType(name);
        if (mime.startsWith('text/')){
          await vfs.writeDoc(await text(rs), {user_id: requester.uid, scene, name, mime});
        }
        else {
          await vfs.writeFile(rs, {user_id: requester.uid, scene, name, mime});
        }
      }
    };

    zip.on("entry", (record)=>{
      onEntry(record).then(()=>{
        zip.readEntry()
      }, (e)=>{
        zip.close();
        zipError=e;
      });
    });
    zip.readEntry();
    logger.debug("Start extracting zip");
    await once(zip, "close");
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
        } else{
          throw new InternalError(`Mixed errors : ${errors.map(r=>r.error.message).join(", ")}`)
        }
      }
    }else{
      logger.debug("zip file closed");
      return results as ImportSuccessResult[];
    }
  });
  return results;
};
