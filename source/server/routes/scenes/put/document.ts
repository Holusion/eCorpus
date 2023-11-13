
import path from "path";
import { Request, Response } from "express";

import { getUserId, getVfs } from "../../../utils/locals.js";
import { BadRequestError } from "../../../utils/errors.js";

import * as merge from "../../../utils/merge.js";

/**
 * Simple case of PUT /scenes/:scene/scene.svx.json
 * Overwrites the current document.
 * @param req 
 * @param res 
 * @returns 
 */
async function overwritePutDocument(req: Request, res :Response){
  const uid = getUserId(req);
  const {scene} = req.params;
  const newDoc = req.body;

  console.log("Overwriting document");

  let s = JSON.stringify(newDoc, null, 2);
  if(s == "{}") throw new BadRequestError(`Invalid json document`);
  const id = await getVfs(req).writeDoc(s, scene, uid);
  res.cookie("docID", `${id}`, {sameSite: "strict", path: path.dirname(req.originalUrl)});
  return res.status(204).send();
}


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
  if(!refId) return await overwritePutDocument(req, res);
  else delete newDoc.asset.id; //Don't write this to DB

  await getVfs(req).isolate(async (tr)=>{
    // perform a diff of the document with the reference one
    const {id: scene_id} = await tr.getScene(scene);
    const {data: currentDocString} = await tr.getDoc(scene_id);
    const currentDoc = JSON.parse(currentDocString);
    const {data: refDocString} = await tr.getDocById(refId);
    const refDoc = JSON.parse(refDocString);

    const docDiff = merge.diff(refDoc, newDoc);
    if(Object.keys(docDiff).length == 0){
      console.log("Nothing to do");
      //Nothing to do
      return res.status(204).send();
    }
    console.log("Merge changes : ", JSON.stringify(docDiff));
    const mergedDoc = merge.apply(currentDoc, docDiff);
    let s = JSON.stringify(mergedDoc);
    if(s == "{}") throw new BadRequestError(`Invalid json document`);
    let id = await tr.writeDoc(s, scene, uid);
    res.status(204).send();
  })
  
};
