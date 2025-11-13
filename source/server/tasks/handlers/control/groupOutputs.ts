
import { TaskHandlerParams } from "../../types.js";


function walkPath(path: string, input: any):any{
  let ptr: any = input;
  while(path.length){
    const m = /^\.?([^.\[$]+|\.?\[[^\]$]+\])/.exec(path);
    if(!m) throw new TypeError(`${path} is not a valid path`);
    let attr: string|number = m[1];
    
    path = path.slice(m[0].length+1);

    if(attr.startsWith("[")){
      let index = parseInt(attr.slice(1, -1));
      if(Number.isInteger(index)){
        attr = index;
      }
    }

    if(typeof attr === "string" && /^['"']/.test(attr)){
      attr = attr.slice(1, -1);
    }

    if(typeof ptr === "undefined") throw new TypeError(`Cannot read properties of undefined (reading '${attr}')`);
    if(ptr == null) throw new TypeError(`Cannot read properties of null (reading '${attr}')`);
    ptr = ptr[attr];
  }
  return ptr;
}

export function mapShape(shape: any, inputs: Map<number, any>):any{
  let shapeString = JSON.stringify(shape);
  return JSON.parse(shapeString, function(key, value){
    if(typeof value !== "string" || value.indexOf("$") !== 0) return value;
    if(value == "$") return [...inputs.values()];
    const task_m = /^\$\[(\d+)\]/.exec(value);
    const task_id = parseInt(task_m?.[1]!);
    if(!task_m || !Number.isInteger(task_id)) throw new TypeError(`Not a valid path selector : ${value}`);
    if(!inputs.has(task_id)) throw new TypeError(`No input task with id ${task_id}`);
    const input = inputs.get(task_id);
    let selector = value.slice(task_m[0].length+1);
    if(!selector.length) return input;
    return walkPath(selector, input);
  });
}

/**
 * Returns all results once all child tasks have completed.
 * It's the task under `TaskListener.group()` or inside tasks as `context.tasks.group()`
 * But it can also be used as a standalone to map any set of outputs to a pre-set shape
 */
export async function groupOutputsTask({task:{after, data}, inputs, context:{logger}}:TaskHandlerParams<any>):Promise<any[]> {
  logger.debug("Group outputs for tasks",  after);
  if(!data || !Object.keys(data).length){
    return [...inputs.values()];
  }
  
  logger.debug(`Use schema ${JSON.stringify(data, null, 2)}`)
  return mapShape(data, inputs);
};