import timers from 'node:timers/promises';
import { TaskDefinition, TaskHandlerParams } from "../../types.js";
import { randomInt } from 'node:crypto';



interface DelayTaskParams{
  time: number;
  variance?:number;
  value?:any;
}

/**
 * Apply a delay before resolving the task.
 * Can be useful with the variance parameter to spread-out heavy loads
 */
export async function delayTask({task: {task_id, fk_scene_id:scene_id, data:{time, variance, value}}, context:{signal, logger }}:TaskHandlerParams<DelayTaskParams>){
  let timeout = time + (variance?randomInt(variance):0);
  logger.debug("Start delay task with timeout: %d", timeout);
  return await timers.setTimeout(timeout, value, {signal});
};
