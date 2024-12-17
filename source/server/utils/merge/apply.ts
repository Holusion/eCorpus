'use strict';
import {Diff, DELETE_KEY, SOURCE_INDEX, withIndex} from "./pointers/types.js";

/**
 * Deep assign two or more objects
 * Like `Object.assign()` but recursive (modifies objects in-place)
 * It's currently quite simplified and doesn't handle strings splicing
 * @param into Object to merge into (will be mutated in-place)
 * @returns into, merged with source(s)
 */
export default function apply<T extends Record<string, any>>(into :T, ...diffs :Diff<T>[]):T{
  for(const diff of diffs){
    if(SOURCE_INDEX in diff) into = withIndex(into, diff[SOURCE_INDEX] as number);
    for(const key in diff){
      const value = diff[key] as T[Extract<keyof T, string>];

      if(value === DELETE_KEY){
        if(Array.isArray(into)){
          into.splice(key as any, 1);
        }else{
          delete into[key];
        }
  
      }else if(typeof value !== "object" //primitive
            ||  typeof into[key] === "undefined" //undefined target
      ){
        into[key] = value;
      }else if(Array.isArray(value)){
        //Replace arrays without looking.
        //This will generally not happen unles there is an exception in diff() that says so.
        //Arrays are generally replaced by a number-indexed object.
        into[key] = value;
      }else{
        //Default case : recurse.
        into[key]  ??= {} as any;
        apply(into[key], value);
      }
    }
  }
  return into;
}


/**
 * Return true if the value was applied, false if it needs further processing.
 * Handles the trivial cases:
 *  - Applies DELETE_KEY
 *  - Applies primitives (typeof value !== "object")
 *  - 
 *  - Applies properties that don't exist in the target
 */
function apply_core<T extends Record<string, any>>(into :T, key:keyof T, value :any):boolean{


  return false;
}