
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
      if(value === DELETE_KEY) delete into[key];
      else if(typeof diff[key] == "object"){
        if(typeof into[key] !== "object") into[key]  = {} as any;
        apply(into[key], value);
      }else{
        into[key] = value;
      }
    }
  }
  return into;
}



export const DELETE_KEY = Symbol("MERGE_DELETE_KEY");

type Diff<T> = {
  [K in keyof T]?: typeof DELETE_KEY|Diff<T[K]>|T[K]|Record<number, any>;
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
    if(typeof to[key] == "undefined") r[key] = DELETE_KEY;
    else if(typeof from[key] == "object"){
      if(to[key] == null){
        if(from[key] != null ) r[key] = null as T[Extract<keyof T, string>];
      }else{
        const d = diff(from[key] as any, to[key] as any);
        if(Object.keys(d).length) r[key] = d;
      }
    }else if(from[key] !== to[key]){
      r[key] = to[key];
    }
  }
  return r;
}
