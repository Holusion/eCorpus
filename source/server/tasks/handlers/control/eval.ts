import {  TaskDefinition, TaskHandlerParams } from "../../types.js";



interface EvalTaskParams{
  /** Stringified function definition  */
  x: string;
  /** Arguments to supply to the created function */
  args?: any[];
}

/**
 * Iterates over a list of tasks, creating them and waiting for completion
 * Returns all results once all child tasks have completed
 * 
 * @warning this will execute code generated from its input. Use with care
 */
export async function evalTask({task:{fk_scene_id:scene_id, task_id, data:{x, args=[]}}, context:{tasks}}:TaskHandlerParams<EvalTaskParams>){
  let fn = Function(`return ${x}`)();
  return fn(...args);
};
