
import { BadRequestError, InternalError } from "../../utils/errors.js";
import * as merge from "../../utils/merge/index.js";
import { IDocument } from "../../utils/schema/document.js";
import { TaskHandlerParams } from "../types.js";

export interface DocMergeData{
  docData: IDocument;
  refId: number;
}
/**
 * Applies a document save that carries a reference to the generation it was edited from.
 * @returns 204 when what was written is exactly what the client sent, either because
 * nothing changed or because nobody wrote in between. 205 when the document was merged
 * with someone else's changes, so the client is now holding stale content and should
 * reload before editing further.
 */
export async function structuredDocMerge({context: {vfs:_vfs, logger}, task: {scene_id, user_id, data: {refId, docData: newDoc}}}:TaskHandlerParams<DocMergeData>): Promise<204|205> {
  if(typeof scene_id !== "number") throw new InternalError(`Can't perform structured merge with no assigned scene_id`);
  if(typeof user_id !== "number") throw new InternalError(`Can't perform structured merge with no assigned user_id`);
  return await _vfs.isolate(async function applyStructuredMerge(tr):Promise<204|205>{
    // perform a diff of the document with the reference one
    const {data: currentDocString, id: currentDocId, generation: currentDocGeneration} = await tr.getDoc(scene_id, true);
    const currentDoc = JSON.parse(currentDocString);
    let refDocString :string;
    if(refId === currentDocId){
      refDocString = currentDocString;
    }else{
      const refDoc = await tr.getFileById(refId);
      if(refDoc.scene_id !== scene_id) throw new BadRequestError(`Document's reference ID is not in this scene`);
      refDocString = refDoc.data!;
    }

    if(!refDocString) throw new BadRequestError(`Referenced document is not valid`);
    const refDoc = JSON.parse(refDocString);

    logger.debug("Ref doc :", JSON.stringify(refDoc.setups![0].tours, null, 2));
    const docDiff = merge.diffDoc(refDoc, newDoc);
    if(Object.keys(docDiff).length == 0){
      logger.log("detected identical documents");
      //Nothing to do
      return 204;
    }

    logger.debug("Diff :", JSON.stringify(docDiff, (key, value)=> value === merge.DELETE_KEY? "*DELETED*":value, 2));
    if(refId == currentDocId){
      //Fast-forward: nobody wrote since the client loaded the document, so what we store
      //is byte for byte what it sent. Nothing to reload.
      await tr.writeDoc(JSON.stringify(newDoc), {scene:scene_id, user_id, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      return 204; //No Content
    }else{
      const mergedDoc = merge.applyDoc(currentDoc, docDiff);
      let s = JSON.stringify(mergedDoc);
      let {id, generation} = await tr.writeDoc(s, {scene: scene_id, user_id: user_id, name: "scene.svx.json", mime: "application/si-dpo-3d.document+json"});
      return 205; //Reset Content: what we stored is not what the client sent
    }
  });
}