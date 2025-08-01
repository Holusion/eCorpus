/**
 * Query string utilities
 */
import QueryString from "qs";
import { BadRequestError } from "./errors.js";

type QsValue =  string | QueryString.ParsedQs |  (string | QueryString.ParsedQs)[] | undefined;

/**
 * Parse common string values to boolean. If value is undefined, return undefined
 * @param v QueryString value as parsed by the express framework
 * @returns cast value
 */
export function qsToBool(v:QsValue) :boolean|undefined{
  if(Array.isArray(v)){
    v = v.pop();
  }
  if(typeof v === "undefined") return undefined;
  if(typeof v === "object"){
    throw new BadRequestError(`Can't cast object value to boolean`);
  }
  if(v === "0" || v === "false" || v === "no") return false;
  if(v === "" || v === "true" || v === "1" || v === "yes") return true;
  return !!v;
}

export function qsToInt(v:QsValue) :number|undefined{
  if(Array.isArray(v)){
    v = v.pop();
  }
  if(typeof v === "object"){
    throw new BadRequestError(`Can't cast object value to boolean`);
  }
  if(typeof v === "undefined" || v === "") return undefined;
  let r = parseInt(v);
  if(!Number.isInteger(r)) throw new BadRequestError(`Not a valid integer : ${v}`);
  return r;
}