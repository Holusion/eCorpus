import {debuglog} from 'util';
import { Request, Response } from "express";

import * as merge from "../../../../../utils/merge/index.js";
import { BadRequestError } from "../../../../../utils/errors.js";
import { getLocals, getUserId, getVfs } from "../../../../../utils/locals.js";

const debug = debuglog("http:body");
const debugmerge = debuglog("http:merge");
/**
 * Special handler for svx files to disallow the upload of invalid JSON.
 * @todo Should check against the official json schema using ajv
 * If the user provides a reference document ID and the document has been updated since, a diff is performed to try to merge the changes.
 */
export default async function handlePutDocument(req :Request, res :Response){
  const {config} = getLocals(req);
  const uid = getUserId(req);
  const {scene} = req.params;
  const newDoc = req.body;
  const refId = newDoc?.asset?.id;
  if(typeof refId !== "undefined") delete newDoc.asset.id; //Don't write this to DB

  if(typeof newDoc !== "object"|| !Object.keys(newDoc).length){
    debug("Bad JSON body:", JSON.stringify(newDoc, null, 2));
    throw new BadRequestError(`Invalid json document`);
  }
  if(!refId || !config.enable_document_merge){
    await getVfs(req).writeDoc(JSON.stringify(newDoc), {scene: scene, user_id: uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    return res.status(204).send();
  }

  await getVfs(req).isolate(async function applyStructuredMerge(tr):Promise<void>{
    // perform a diff of the document with the reference one
    const {data: currentDocString, id: currentDocId, generation: currentDocGeneration} = await tr.getDoc(scene);
    const currentDoc = JSON.parse(currentDocString);
    const {data: refDocString,} = await tr.getFileById(refId);
    if(!refDocString) throw new BadRequestError(`Referenced document is not valid`);
    const refDoc = JSON.parse(refDocString);

    //console.log("Ref doc :", JSON.stringify(refDoc.setups![0].tours, null, 2));
    //console.log("New doc :", JSON.stringify(newDoc.setups![0].tours, null, 2));
    const docDiff = merge.diffDoc(refDoc, newDoc);
    if(Object.keys(docDiff).length == 0){
      debugmerge("structured merge detected identical documents");
      //Nothing to do
      return;
    }

    //console.log("Diff :", JSON.stringify(docDiff, (key, value)=> value === merge.DELETE_KEY? "*DELETED*":value, 2));
    const mergedDoc = merge.applyDoc(currentDoc, docDiff);
    //console.log("Merged doc :", JSON.stringify(mergedDoc.setups![0].tours, null, 2));
    let s = JSON.stringify(mergedDoc);
    let {id, generation} = await tr.writeDoc(s, {scene: scene, user_id: uid, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
    if(currentDocGeneration+1 < generation){
      debugmerge(`structured merge performed a three point merge from ${currentDocId} to ${id}`);
      debugmerge(`Using diff: ${docDiff}`);
    }
  });
  res.status(204).send();
};
