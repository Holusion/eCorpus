
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
 * 
 * `diff()` holds the generalized diff logic while `toPointers` is in charge of the implementation details regarding the document's schema
 * @see diff
 */
export function diffDoc(from:IDocument,to:IDocument){
  return diff( toPointers(from), toPointers(to));
}

/**
 * like `apply()` but dereferences a document's pointers first to make a cleaner diff, then re-references the result
 * 
 * `apply()` holds the generalized merge logic while `toPointers` and `fromPointers` are in charge of the implementation details regarding the document's schema
 * @see apply
 * @see fromPointers
 * @see toPointers
 */
export function applyDoc(from:IDocument, diff:Diff<DerefDocument>){
  return fromPointers(apply(toPointers(from), diff));
}
