import {  TaskDefinition, TaskHandlerParams } from "../../types.js";

export interface GroupOutputsParams{
  children?: number[];
}

/**
 * Returns all results once all child tasks have completed.
 * Do not use directly, but through `TaskListener.group()` or inside tasks as `context.tasks.group()`
 */
export async function groupOutputsTask({task:{fk_scene_id:scene_id, task_id, after, parent, data:{ children }}, context:{logger, tasks}}:TaskHandlerParams<GroupOutputsParams>):Promise<number|any[]> {
  let outputs= [];
  let tracked =  new Set([...(children?? []), ...(after?? [])]);
  if(typeof parent === "number") tracked.delete(parent);
  logger.debug("Group outputs for tasks",  tracked);
  for(let id of tracked){
    let t = await tasks.getTask(id);
    outputs.push(t.output);
  }

  // Wait for children one by one :
  // We don't want to create too many event listeners
  // And we don't need to eagerly get results as soon as they are available
  logger.debug("Successfully grouped %d tasks", outputs.length);
  return outputs;
};

export type MapOutputsTaskShape = Record<string, any>;

export function mapShape(shape: MapOutputsTaskShape, outputs: any):any{
  let shapeString = JSON.stringify(shape);
  return JSON.parse(shapeString, function(key, value){
      if(typeof value !== "string" || value.indexOf("$") !== 0) return value;
      let path = value.slice(1);
      let ptr = outputs;
      while(path.length){
        const m = /^\.?([^.\[]+|\.?\[[^.\[]+\])/.exec(path);
        if(!m) throw new TypeError(`${path} is not a valid path`);
        const attr = m[1];
        if(typeof ptr === "undefined") throw new TypeError(`Cannot read properties of undefined (reading '${attr}')`);

        path = path.slice(attr.length+1);
        if(attr.startsWith("[")){
          let index = attr.slice(1, -1);
          if(/^[+-]?\d+$/.test(index)){
            ptr = ptr[parseInt(index)];
          }else{
            ptr = ptr[(/^['"']/.test(index))?index.slice(1, -1): index];
          }
        }else{
          ptr = ptr[attr];
        }
      }
      return ptr;
    });
}

export async function mapOutputsTask({task: {after, data}, context: {tasks}}:TaskHandlerParams<MapOutputsTaskShape>){
  if(!after?.length) throw new Error("mapOutputTask must have at least one dependency");
  let outputs = (await Promise.all(after.map(id=> tasks.getTask(id)))).map(t=>t.output);
  return mapShape(data, outputs);
}