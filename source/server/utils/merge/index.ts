
import {Diff, DELETE_KEY, DerefDocument} from "./pointers/types.js";
import apply from "./apply.js";
import diff from "./diff.js";
import { IDocument } from "../schema/document.js";
import { fromPointers, toPointers } from "./pointers/index.js";

export {
  Diff, 
  DELETE_KEY, 
  apply, 
  diff
};

/**
 * like `diff()` but dereferences a document's pointers first to make a cleaner diff
 * @see diff
 */
export function diffDoc(from:IDocument,to:IDocument){
  return diff( toPointers(from), toPointers(to));
}

/**
 * like `apply()` but dereferences a document's pointers first to make a cleaner diff, then re-references the result
 * @see apply
 * @see fromPointers
 * @see toPointers
 */
export function applyDoc(from:IDocument, diff:Diff<DerefDocument>){
  return fromPointers(apply(toPointers(from), diff));
}
