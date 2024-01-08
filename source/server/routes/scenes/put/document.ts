import {inspect} from "util";
import path from "path";
import { Request, Response } from "express";

import { getUserId, getVfs } from "../../../utils/locals.js";
import { BadRequestError } from "../../../utils/errors.js";

import * as merge from "../../../utils/merge/index.js";


/**
 * Special handler for svx files to disallow the upload of invalid JSON.
 * @todo Should check against the official json schema using ajv
 * If the user provides a reference document ID and the document has been updated since, a diff is performed to try to merge the changes.
 */
export default async function handlePutDocument(req :Request, res :Response){
  const uid = getUserId(req);
  const {scene} = req.params;
  const newDoc = req.body;
  const refId = newDoc?.asset?.id;

  if(typeof newDoc !== "object"|| !Object.keys(newDoc).length) throw new BadRequestError(`Invalid json document`);

  if(!refId){
    await getVfs(req).writeDoc(JSON.stringify(newDoc), scene, uid);
    return res.status(204).send();
  }

  delete newDoc.asset.id; //Don't write this to DB

  await getVfs(req).isolate(async (tr)=>{
    // perform a diff of the document with the reference one
    const {id: scene_id} = await tr.getScene(scene);
    const {data: currentDocString} = await tr.getDoc(scene_id);
    const currentDoc = JSON.parse(currentDocString);
    const {data: refDocString} = await tr.getDocById(refId);
    const refDoc = JSON.parse(refDocString);

    const docDiff = merge.diffDoc(refDoc, newDoc);
    if(Object.keys(docDiff).length == 0){
      //Nothing to do
      return res.status(204).send();
    }

    const mergedDoc = merge.applyDoc(currentDoc, docDiff);
    let s = JSON.stringify(mergedDoc);
    let id = await tr.writeDoc(s, scene, uid);
    res.status(204).send();
  });
  
};
