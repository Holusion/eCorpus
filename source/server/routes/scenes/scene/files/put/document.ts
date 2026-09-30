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
 *
 * Every success carries an `ETag` naming the document that is current for the scene once
 * the write is done — the same token `GET scene.svx.json` reports and the client echoes
 * back as `asset.id`. On 204 that is all the client needs to keep editing without
 * re-reading the document; on 205 it names the merged document it has to load.
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
  if(!refId || !config.get("enable_document_merge")){
    const {id} = await getVfs(req).writeDoc(JSON.stringify(newDoc), {scene: sceneName, user_id: uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    res.set("ETag", `"${id}"`);
    return res.status(204).send();
  }
  let {id: scene_id} = await vfs.getScene(sceneName);
  //Run the merge in a task so we get more logs when necessary
  let {code, id} = await taskScheduler.run({
    immediate: true,
    scene_id,
    user_id: uid,
    data: {
      docData: newDoc,
      refId,
    },
    handler: structuredDocMerge,
  });

  res.set("ETag", `"${id}"`);
  res.status(code).send();
};
