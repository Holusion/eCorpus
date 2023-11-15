
/**
 * Special symbol to mark a field for deletion in a diff object
 */
export const DELETE_KEY = Symbol("_DELETE_KEY");

type Diff<T> = {
  [K in keyof T]?: typeof DELETE_KEY|Diff<T[K]>|T[K]|Record<number, any>;
}


/**
 * Deep assign two or more objects
 * Like `Object.assign()` but recursive
 * It's currently quite simplified and doesn't handle strings splicing
 * @param into Object to merge into (will be mutated in-place)
 * @returns into, merged with source(s)
 */
export function apply<T extends Record<string, any>>(into :T, ...diffs :Diff<T>[]):T{
  for(const diff of diffs){
    for(const key in diff){
      const value = diff[key] as T[Extract<keyof T, string>];
      if(apply_core(into, key, value)){
        continue;
      }

      //Then handle arrays to apply edge cases
      if(Array.isArray(into[key])){
        apply_array(into[key], value);
        continue;
      }
      //Default case : recurse.
      into[key]  ??= {} as any;
      apply(into[key], value);
    }
  }
  return into;
}

//Handle special merge conditions for arrays
function apply_array<T extends Array<any>>(into :T, ...diffs :Diff<T>[]):T{
  for (const diff of diffs){
    for(const idx in diff){
      const value = diff[idx];
      if(apply_core(into, idx, value)){
        continue;
      }
      if(typeof into[idx] !== undefined){
        if(value.id){
          const ref_id = into[idx].id;
          if(ref_id && ref_id != value.id){
            into.push(value);
            continue;
          }
        }
        /** 
         * @todo names should more or less follow the same rules but are trickier
         * Because they require a parent lookup to also reorder affected nodes.
         */
      }
      //Default case : recurse as apply() would.
      into[idx]  ??= {} as any;
      apply(into[idx], value);
    }
  }
  return into;
}


function apply_core<T extends Record<string, any>>(into :T, key:keyof T, value :any):boolean{

  if(value === DELETE_KEY){
    delete into[key];
    return true;
  }

  if(typeof value !== "object"){
    //Handle primitives
    into[key] = value;
    return true;
  }

  return false;
}

/**
 * Computes a diff between two objects.
 * Applying deepMerge(a, diff(a,b)) should yield b
 * deleted keys are represented using the DELETE_KEY symbol
 * @param from origin document
 * @param to target document
 * @returns 
 */
export function diff<T extends Record<string,any>>(from :T, to :T) :Diff<T>{
  const is_array = Array.isArray(from);
  if(is_array && !Array.isArray(to)) throw new Error("Can't diff an array with an object");

  let r :Diff<T> = {} as any;
  const keys :Set<keyof T>= new Set([...Object.keys(from), ...Object.keys(to)]);
  for(const key of keys.values()){

    if(typeof to[key] == "undefined"){
      r[key] = DELETE_KEY;
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

    const d = diff(from[key] as any, to[key] as any);
    if(Object.keys(d).length){
      //console.log("Diffing", key, from[key], to[key]);
      r[key] = d;
    }


  }
  return r;
}
