import {Diff, DELETE_KEY, SOURCE_INDEX, withIndex} from "./pointers/types.js";

/**
 * Computes a diff between two objects.
 * Applying deepMerge(a, diff(a,b)) should yield b
 * deleted keys are represented using the DELETE_KEY symbol
 * It treats arrays as primitives (ie. will overwrite blindly any array) so they should be pre-transformed into dictionaries where possible
 * @warning it messes with properties iteration order by making a `Set<from.keys() ∪ to.keys()>`
 * @param from origin document
 * @param to target document
 * @returns 
 */
export default function diff<T extends Record<string, any>&{[SOURCE_INDEX]?:number}>(from :T, to :T) :Diff<T>{
  const is_array = Array.isArray(from);
  if(is_array && !Array.isArray(to)) throw new Error("Can't diff an array with an object");

  let r :Diff<T> = {} as any;

  if(SOURCE_INDEX in to && to[SOURCE_INDEX] !== from[SOURCE_INDEX]){
    r = withIndex(r, to[SOURCE_INDEX] as any);
  }

  const keys :Set<keyof T>= new Set([...Object.keys(from), ...Object.keys(to)]);
  for(const key of keys.values()){

    if(typeof to[key] == "undefined"){
      if(typeof from[key] != "undefined") r[key] = DELETE_KEY;
      continue;
    }
    if(typeof from[key] != "object"){
      if(from[key] === to[key]) continue;
      //Simple case with primitive values
      //console.log("Assigning ", key, to[key]);
      r[key] = to[key];
      continue;
    }

    //Handle cases where `typeof from[key] === "object"`

    if(to[key] == null){
      //Null is special because it can't be fed back to diff() recursively
      if(from[key] != null ) r[key] = null as T[Extract<keyof T, string>];
      continue;
    }

    if(from[key] == null){
      //We already verified that to[key] is not null
      r[key] = to[key];
      continue;
    }

    const d = diff(from[key], to[key]);
    if(Object.keys(d).length || typeof (d as any)[SOURCE_INDEX] !== "undefined"){
      //console.log("Diffing", key, from[key], to[key]);
      r[key] = d;
    }
  }
  return r;
}
