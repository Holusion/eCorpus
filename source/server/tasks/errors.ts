import { HTTPError } from "../utils/errors.js";


/**
 * Constructs an appropriate error from a generic object
 * returned from the database
 */
export function parseTaskError(output: any) :Error|HTTPError{
  if(typeof output === "string" && output.length) return new Error(output);
  let err :any = new Error("Unknown task error");
  if(! output || typeof output !== "object") return err;
  for(let key in output){
    err[key] = output[key];
  }
  return err;
}
/**
 * Serializes an `Error` or {@link HTTPError}.
 * 
 * The string is guaranteed to be the serialization of an object with at least a "message" property
 * Iterates over the `message` and `stack` properties of standard errors, which `JSON.stringify` wouldn't do
 * @fixme we should possibly try to handle errors issued from postgresql too
 */
export function serializeTaskError(e: HTTPError|Error|string):string{
  if(typeof e === "string") return JSON.stringify({message: e});
  else if(!e || typeof e !== "object") return JSON.stringify({message: `Error: ${e}`});
  else if(!e.message) return JSON.stringify({message: `Error: ${JSON.stringify(e)}`});
  else return JSON.stringify(e, Object.getOwnPropertyNames(e));
}