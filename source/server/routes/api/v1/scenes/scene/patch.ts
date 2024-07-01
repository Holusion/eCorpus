
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
  let user_id = getUserId(req);
  let {scene: sceneName} = req.params;
  let {name, tags} = req.body;
  //Ensure all or none of the changes are comitted
  let result = await getVfs(req).isolate(async (vfs)=>{
    let scene = await vfs.getScene(sceneName, user_id);
    if(name && name !== sceneName){
      try{
        await vfs.renameScene(scene.id, name);
      }catch(e:any){
        if(e.code == "SQLITE_CONSTRAINT" && /UNIQUE constraint failed: scenes.scene_name/.test(e.message)){
          throw new ConflictError(`A scene named ${name} already exists`);
        }else{
          throw e;
        }
      }
    }
    if(tags){
      for(let tag of tags){
        if (scene.tags.indexOf(tag) !== -1) continue;
        await vfs.addTag(scene.id, tag.trim());
      }
      for(let ex_tag of scene.tags){
        if(tags.indexOf(ex_tag) !== -1) continue;
        await vfs.removeTag(scene.id, ex_tag);
      }
    }

    return await vfs.getScene(scene.id, user_id);
  });
  res.status(200).send(result);
};
