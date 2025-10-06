import {  TaskDefinition, TaskHandlerParams } from "../../types.js";

export interface GroupOutputsParams{
  children: number[];
}

/**
 * Returns all results once all child tasks have completed.
 * Do not use directly, but through the group method
 */
export async function groupOutputsTasks({task:{fk_scene_id:scene_id, task_id, data:{ children }}, logger, context:{tasks}}:TaskHandlerParams<GroupOutputsParams>):Promise<number|any[]> {
  if(!children) return [];
  let outputs = [];

  logger.debug("Group outputs #%d", task_id);
  // Wait for children one by one :
  // We don't want to create too many event listeners
  // And we don't need to eagerly get results as soon as they are available
  for(let task_id of children){
    let result = await tasks.wait(task_id);
    outputs.push(result);
  }
    logger.debug("Successfully group tasks :", task_id, outputs);
  return outputs;
};

