
import { ConflictError } from "../../../../../utils/errors.js";
import { getUserId, getVfs } from "../../../../../utils/locals.js";
import { Request, Response } from "express";



/**
 * Patches a scene's properties
 * @param req
 * @param res
 * @returns {Promise<void>}
 */
export default async function patchScene(req :Request, res :Response){
  let vfs = getVfs(req);
  let user_id = getUserId(req);
  let {scene} = req.params;
  let {name} = req.body;
  //Ensure all or none of the changes are comitted
  let result = await getVfs(req).isolate(async (vfs)=>{
    let {id} = await vfs.getScene(scene, user_id);
    if(name && name !== scene){
      try{
        await vfs.renameScene(id, name);
      }catch(e:any){
        if(e.code == "SQLITE_CONSTRAINT" && /UNIQUE constraint failed: scenes.scene_name/.test(e.message)){
          throw new ConflictError(`A scene named ${name} already exists`);
        }else{
          throw e;
        }
      }
    }

    return await vfs.getScene(id, user_id);
  });
  res.status(200).send(result);
};
