import { Request, Response } from "express";

import { getUserId, getLocals } from "../../../utils/locals.js";
import { BadRequestError, UnauthorizedError } from "../../../utils/errors.js";
import { inspectGlb } from "../../../tasks/handlers/inspectGlb.js";
import { createDocumentFromFiles } from "../../../tasks/handlers/uploads.js";

const sceneLanguages = ["EN", "ES", "DE", "NL", "JA", "FR", "HAW"] as const;
type SceneLanguage = typeof sceneLanguages[number];
function isSceneLanguage(l:any) :l is SceneLanguage|undefined{
  return typeof l === "undefined" || sceneLanguages.indexOf(l.toUpperCase()) !== -1;
}



/**
 * Tries to create a scene.
 * has consistency problems : a scene could get created without its associated 3D object
 * Whether or not it's desired behaviour remains to be defined
 */
export default async function postScene(req :Request, res :Response){
  const {vfs, taskScheduler} = getLocals(req);
  let user_id = getUserId(req);
  let {scene} = req.params;
  let {language} = req.query;
  
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
  await taskScheduler.run({
    scene_id,
    user_id,
    type: "postScene",
    data: {},
    handler: async function postsSceneHandler({context: {logger, vfs}}){
      logger.debug("Draining the HTTP request into scene space");
      let f = await vfs.writeFile(req, {user_id, scene: scene,  mime:"model/gltf-binary", name: `models/${scene}.glb`});
      if(f.size ==0 || !f.hash) throw new BadRequestError(`Body was empty. Can't create a scene.`); 
      logger.debug("Parse the created file");
      const meta = await taskScheduler.run({
        immediate: true,
        data: {fileLocation: vfs.relative(vfs.getPath(f as {hash: string}))},
        handler: inspectGlb,
      });

      logger.debug(`Generate default document for model ${meta.name}`);
      const document = await taskScheduler.run({
        immediate: true,
        handler: createDocumentFromFiles,
        data: {
          scene: scene,
          language: language,
          models: [{
            uri: f.name,
            quality: "High",
            usage: "Web3D",
            byteSize: f.size,
             ...meta,
          }],
        }
      });
      logger.debug(`Write scene document`);
      await vfs.writeDoc(JSON.stringify(document), {
        scene: scene_id,
        user_id: user_id,
        name: "scene.svx.json",
        mime: "application/si-dpo-3d.document+json"
      });
    }
  }).catch(async e=>{
    //If written, the file will stay as a loose object but will get cleaned-up later
    await vfs.removeScene(scene_id).catch(e=>console.warn(e));
    throw e;
  });
  
  res.status(201).send({code: 201, message: "created scene with id :"+scene_id});
};
