import {  TaskDefinition, TaskHandlerParams } from "../../types.js";



interface ReduceTaskParams{
  tasks?: Pick<TaskDefinition<any>,"type"|"data">[],
}

/**
 * Iterates over a list of tasks, creating them and waiting for completion
 * Returns all results once all child tasks have completed
 */
export async function reduceTasks({task:{fk_scene_id:scene_id, task_id, data:{tasks: children}}, logger, context:{tasks}}:TaskHandlerParams<ReduceTaskParams>):Promise<number|any[]> {
  if(!children) return [];

  let ids :number[] = [];
  for (const child of children){
    let child_task = await tasks.create(scene_id, {...child, after: [task_id]});
    ids.push(child_task);
  }
  logger.debug(`Created child tasks: [${ids.join(", ")}]`);

  return await tasks.create(scene_id, {type: "afterReduceTasks", data: {tasks: ids}, after: ids});
};


export async function afterReduceTasks({task:{fk_scene_id: scene_id, task_id, data:{tasks: children}}, logger, context:{tasks}}:TaskHandlerParams<{tasks: number[]}>):Promise<any[]>{
  if(!children) return [];
  let outputs = [];

  logger.debug("Reducing #%d", task_id);
  // Wait for children one by one :
  // We don't want to create too many event listeners
  // And we don't need to eagerly get results as soon as they are available
  for(let task_id of children){
    let result = await tasks.wait(task_id);
    logger.debug("Successfully reduced task :", task_id, result);
    outputs.push(result);
  }
  return outputs;
};
