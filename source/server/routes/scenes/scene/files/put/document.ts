import {debuglog} from 'util';
import { Request, Response } from "express";

import { BadRequestError } from "../../../../../utils/errors.js";
import { getLocals, getUserId, getVfs } from "../../../../../utils/locals.js";
import { structuredDocMerge } from '../../../../../tasks/handlers/structuredDocMerge.js';

const debug = debuglog("http:body");
/**
 * Special handler for svx files to disallow the upload of invalid JSON.
 * @todo Should check against the official json schema using ajv
 * If the user provides a reference document ID and the document has been updated since, a diff is performed to try to merge the changes.
 */
export default async function handlePutDocument(req :Request, res :Response){
  const {config, taskScheduler, vfs} = getLocals(req);
  const uid = getUserId(req);
  const {scene:sceneName} = req.params;
  const newDoc = req.body;
  let refId = newDoc?.asset?.id;
  if(typeof refId !== "undefined") delete newDoc.asset.id; //Don't write this to DB

  if(typeof newDoc !== "object"|| !Object.keys(newDoc).length){
    debug("Bad JSON body:", JSON.stringify(newDoc, null, 2));
    throw new BadRequestError(`Invalid json document`);
  }
  if(!refId || !config.enable_document_merge){
    await getVfs(req).writeDoc(JSON.stringify(newDoc), {scene: sceneName, user_id: uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    return res.status(204).send();
  }
  let {id: scene_id} = await vfs.getScene(sceneName);
  //Run the merge in a task so we get more logs when necessary
  let code = await taskScheduler.run({
    immediate: true,
    scene_id,
    user_id: uid,
    data: {
      docData: newDoc,
      refId,
    },
    handler: structuredDocMerge,
  });
  
  res.status(code).send();
};
