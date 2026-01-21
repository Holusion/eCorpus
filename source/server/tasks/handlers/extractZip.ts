import { Readable } from "node:stream";
import { once } from "node:events";
import { ImportSceneResult, requireFileInput, TaskHandlerParams } from "../types.js";
import yauzl, { Entry, ZipFile } from "yauzl";
import path from "node:path";
import { isUserAtLeast } from "../../auth/User.js";
import { HTTPError, UnauthorizedError } from "../../utils/errors.js";
import { parseFilepath } from "../../utils/archives.js";
import { toAccessLevel } from "../../auth/UserManager.js";
import { getMimeType } from "../../utils/filetypes.js";
import { text } from "node:stream/consumers";
import { finished } from "node:stream/promises";




interface ExtractZipParams{
  /**Explicit filepath input. Otherwise it would have to be passed from a previous task's output */
  filepath?: string,
}

/**
 * Analyze an uploaded file and create child tasks accordingly
 */
export async function extractScenesArchive({task: {fk_scene_id: scene_id, fk_user_id: user_id, data: {filepath}}, inputs, context:{vfs, logger, userManager, tasks}}:TaskHandlerParams<ExtractZipParams>){
  
  if(!filepath){
    for(let input of inputs.values()){
      if(typeof input !== "string" && typeof input?.filepath !== "string") continue;
      if(filepath) throw new Error("More than one input provides a file");
      filepath = input?.filepath ?? input;
    }
  }
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
    /**
     * Handles a zip entry. Returns early if some files are to be skipped
     */
    const onEntry = async (record :Entry) =>{
      const {scene, name, isDirectory} = parseFilepath(record.fileName);
      if(!scene ) return;
      if(!scenes.has(scene)){
        let result:ImportSceneResult;
        //Create the scene
        try{
          if(toAccessLevel("write") <= toAccessLevel(await userManager.getAccessRights(scene, requester.uid))){
            result = {name: scene, action: "update"};
            logger.log(`Scene ${scene} will be updated`);
          }else{
            throw new UnauthorizedError(`User doesn't have write permissions on ${scene}`);
          }
        }catch(e){
          if((e as HTTPError).code != 404) throw e;
          //404 == Not Found. Check if user can create the scene
          if (isUserAtLeast(requester, "create")) {
            await vfs.createScene(scene, requester.uid);
            result = {name: scene, action: "create"};
            logger.log(`Scene ${scene} will be created`);
          }else{
            throw new UnauthorizedError(`User doesn't have write permissions on ${scene}`);
          }
        }
        scenes.set(scene, {folders: new Set(), ...result});
      }

      const {action, folders} = scenes.get(scene)!;
      if (action === "error") return;
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

    await once(zip, "close");
    if(zipError) throw zipError;
    else return [...scenes.values()].map<ImportSceneResult>(({folders, ...r})=> r);
  });
  //@FIXME schedule deletion for the source file?
  return results;
};
