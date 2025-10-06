import { Request, Response } from "express";

import { getVfs, getUserId, getTaskScheduler } from "../../../utils/locals.js";
import uid from "../../../utils/uid.js";
import { BadRequestError, UnauthorizedError } from "../../../utils/errors.js";

const sceneLanguages = ["EN", "ES", "DE", "NL", "JA", "FR", "HAW"] as const;
type SceneLanguage = typeof sceneLanguages[number];
function isSceneLanguage(l:any) :l is SceneLanguage|undefined{
  return typeof l === "undefined" || sceneLanguages.indexOf(l) !== -1;
}


/**
 * Tries to create a scene.
 * has consistency problems : a scene could get created without its associated 3D object
 * Whether or not it's desired behaviour remains to be defined
 */
export default async function postScene(req :Request, res :Response){
  let vfs = getVfs(req);
  let scheduler = getTaskScheduler(req);
  let user_id = getUserId(req);
  let {scene} = req.params;
  let {language} = req.query;
  language = typeof language === "string"?language.toUpperCase(): language;
  if(req.is("multipart")|| req.is("application/x-www-form-urlencoded")){
    throw new BadRequestError(`${req.get("Content-Type")} content is not supported on this route. Provide a raw Zip attachment`);
  }
  if(!isSceneLanguage(language)){
    throw new BadRequestError(`Invalid scene language requested: ${language}`)
  }
  if(!user_id){
    throw new UnauthorizedError("Requires authenticated user");
  }
  
  let scene_id = await vfs.createScene(scene, user_id);
  try{
    let f = await vfs.writeFile(req, {user_id, scene: scene,  mime:"model/gltf-binary", name: `models/${scene}.glb`});
    let task = await scheduler.create(scene_id, {
      type: "createDocument",
      data: {
        models: [{
          id: uid(),
          file: f,
          quality: "High",
          usage: "Web3D"
        }],
        name: scene,
        user_id,
        language,
      }
    });
    await scheduler.wait(task);
  }catch(e){
    //If written, the file will stay as a loose object but will get cleaned-up later
    await vfs.removeScene(scene_id).catch(e=>console.warn(e));
    throw e;
  }
  res.status(201).send({code: 201, message: "created scene with id :"+scene_id});
};
