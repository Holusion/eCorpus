'use strict';
import {Diff, DELETE_KEY, isPatch, SOURCE_INDEX, withIndex} from "./pointers/types.js";

/**
 * Deep assign two or more objects
 * Like `Object.assign()` but recursive (modifies objects in-place)
 * It's currently quite simplified and doesn't handle strings splicing
 *
 * When a diff produced by `diff()` patches an object that is no longer in `into` —
 * because it was removed concurrently — the removal wins and the patch is skipped.
 * Applying it would rebuild a fragment of the removed object out of whatever the patch
 * happened to touch, yielding a tour with no steps or a node with no model.
 * Whole values, and diffs written by hand, are still assigned as before.
 * @see markPatch for how a partial patch is told apart from a whole value
 * @param into Object to merge into (will be mutated in-place)
 * @returns into, merged with source(s)
 */
export default function apply<T extends Record<string, any>>(into :T, ...diffs :Diff<T>[]):T{
  for(const diff of diffs){
    if(SOURCE_INDEX in diff) into = withIndex(into, diff[SOURCE_INDEX] as number);
    for(const key of Object.getOwnPropertyNames(diff) as Extract<keyof Diff<T>, string>[]){
      const value = diff[key] as T[Extract<keyof T, string>];

      if(value === DELETE_KEY){
        if(Array.isArray(into)){
          into.splice(key as any, 1);
        }else{
          delete into[key];
        }
  
      }else if(typeof value !== "object" /*primitive*/){
        into[key] = value;
      }else if(value == null /* null is typeof object*/){
        into[key] = value;
      }else if(Array.isArray(value)){
        //Replace arrays without looking.
        //This will generally not happen unles there is an exception in diff() that says so.
        //Arrays are generally replaced by a number-indexed object.
        into[key] = value;
      }else{
        if((into[key] === null || typeof into[key] !== "object") && isPatch(diff, key)){
          //The object this patch describes was removed while we were editing. Rebuilding
          //it from the patch would yield a fragment, so the removal wins.
          continue;
        }
        //Default case : recurse.
        into[key] ??= {} as any;
        apply(into[key], value);
      }
    }
  }
  return into;
}
