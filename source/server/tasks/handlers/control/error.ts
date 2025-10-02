import timers from 'node:timers/promises';
import { TaskDefinition, TaskHandlerParams } from "../../types.js";
import { randomInt } from 'node:crypto';



interface ErrorTaskParams{
  timeout?: number;
  message: string;
}

/**
 * This task will always throw an error with the user-provided message.
 * Generally not useful outside of tests
 */
export async function errorTask({task: {task_id, fk_scene_id:scene_id, data:{timeout=0, message}}, signal, logger, context:{vfs, tasks}}:TaskHandlerParams<ErrorTaskParams>){
  await timers.setTimeout(timeout);
  throw new Error(message);
};
