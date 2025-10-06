import {  TaskDefinition, TaskHandlerParams } from "../../types.js";

export interface GroupOutputsParams{
  children?: number[];
}

/**
 * Returns all results once all child tasks have completed.
 * Do not use directly, but through the group method
 */
export async function groupOutputsTask({task:{fk_scene_id:scene_id, task_id, after, parent, data:{ children }}, context:{logger, tasks}}:TaskHandlerParams<GroupOutputsParams>):Promise<number|any[]> {
  let outputs= [];
  let tracked =  new Set([...(children?? []), ...(after?? [])]);
  if(typeof parent === "number") tracked.delete(parent);
  logger.debug("Group outputs #%d", task_id, tracked);
  for(let id of tracked){
    let t = await tasks.getTask(id);
    outputs.push(t.output);
  }

  // Wait for children one by one :
  // We don't want to create too many event listeners
  // And we don't need to eagerly get results as soon as they are available
    logger.debug("Successfully completed group tasks :", task_id, outputs);
  return outputs;
};

