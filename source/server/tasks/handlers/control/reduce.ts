import {  TaskDefinition, TaskHandlerParams } from "../../types.js";



interface ReduceTaskParams{
  tasks?: Pick<TaskDefinition<any>,"type"|"data">[],
}

/**
 * Iterates over a list of tasks, creating them and waiting for completion
 * Returns all results once all child tasks have completed
 */
export async function reduceTasks({task:{fk_scene_id:scene_id, task_id, data:{tasks: children}}, logger, context:{tasks}}:TaskHandlerParams<ReduceTaskParams>){
  if(!children) return;
  let outputs = [];
  let child_tasks = await Promise.all(children.map(child=>tasks.create(scene_id, {...child, parent: task_id})));
    logger.debug("Created child tasks");

  //Wait for children one by one :
  // We don't want to create too many event listeners
  // And we don't need to eagerly get results as soon as they are available
  for(let {task_id} of child_tasks){
    let result = await tasks.wait(task_id);
    logger.debug("Successfully awaited task :", task_id);
    outputs.push(result.output);
  }
  return outputs;
};
