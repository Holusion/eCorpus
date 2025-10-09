import { Request, Response } from "express";

import { getVfs, getUserId, getTaskScheduler } from "../../../utils/locals.js";
import uid from "../../../utils/uid.js";
import { BadRequestError, UnauthorizedError } from "../../../utils/errors.js";
import { writeFile } from "fs/promises";

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
  let {language: languageQuery, optimize: optimizeQuery} = req.query;
  const language = typeof languageQuery === "string"?languageQuery.toUpperCase(): languageQuery;
  const optimize = (typeof optimizeQuery === "string" && ["false", "0", "no"].indexOf(optimizeQuery) !== -1)?false: true;
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
    let tmpfile = vfs.mktemp(scene_id.toString(10));
    await writeFile(tmpfile, req);
    let task = await scheduler.create(scene_id, {
      type: "handleUploads",
      data: {
        files: [{
          path: tmpfile,
          name: `models/${scene}.glb`,
        }],
        scene_name: scene,
        user_id: user_id!,
        language,
        optimize,
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
