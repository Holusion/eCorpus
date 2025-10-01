
import { BadRequestError, ConflictError } from "../../../utils/errors.js";
import { getUserId, getUserManager, getVfs } from "../../../utils/locals.js";
import { Request, Response } from "express";
import errors from "../../../vfs/helpers/errors.js";



/**
 * Patches a scene's properties
 * @param req
 * @param res
 * @returns {Promise<void>}
 */
export default async function patchScene(req :Request, res :Response){
  let user_id = getUserId(req);
  let {scene: sceneName} = req.params;
  let {name, permissions, groupPermissions, tags, archived, public_access, default_access, ...remainings} = req.body;
  if (Object.keys(remainings).length!=0){
    throw new BadRequestError("Unknowns keys: " + Object.keys(remainings).toString() );
  }
  //Ensure all or none of the changes are comitted
  let result = await getVfs(req).isolate(async (vfs)=>{
    let scene = await vfs.getScene(sceneName, user_id);
    if(typeof archived !== "undefined"){
      if(!JSON.parse(archived)){
        await vfs.unarchiveScene(scene.id, name);
      }else{
        await vfs.archiveScene(scene.id);
      }
    }else if(name && name !== sceneName){
      try{
        await vfs.renameScene(scene.id, name);
      }catch(e:any){
        if(e.code == errors.unique_violation && e.constraint == "scenes_scene_name_key"){
          throw new ConflictError(`A scene named ${name} already exists`);
        }else{
          throw e;
        }
      }
    }

    if(typeof tags === "string" || Array.isArray(tags)){
      tags = (Array.isArray(tags)?tags: [tags]).map(t=>(typeof t === "string")?t.trim(): t).filter(t=>t);
      for(let tag of tags){
        let name = tag.trim();
        if(!name) continue;
        else if (scene.tags.indexOf(name) !== -1) continue;
        await vfs.addTag(scene.id, name);
      }
      for(let ex_tag of scene.tags){
        if(tags.indexOf(ex_tag) !== -1) continue;
        await vfs.removeTag(scene.id, ex_tag);
      }
    }

    if(permissions){
      let userManager = getUserManager(req);
      let {scene} = req.params;
      for(let key in permissions){
        await userManager.grant(scene, key, permissions[key]);
      }
    }

    if(groupPermissions){
      let userManager = getUserManager(req);
      let {scene} = req.params;
      for(let key in groupPermissions){
        await userManager.grantGroup(scene, key, permissions[key]);
      }
    }

    if(public_access){
      let userManager = getUserManager(req);
      let {scene} = req.params;
      await userManager.setPublicAccess(scene, public_access);
    }

    if(default_access){
      let userManager = getUserManager(req);
      let {scene} = req.params;
      await userManager.setDefaultAccess(scene, default_access);
    }

    return await vfs.getScene(scene.id, user_id);
  });
  res.status(200).send(result);
};
