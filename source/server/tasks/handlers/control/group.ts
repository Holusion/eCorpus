import timers from 'node:timers/promises';
import { TaskDefinition, TaskHandlerParams } from "../../types.js";
import { randomInt } from 'node:crypto';



interface GroupTaskParam{}

/**
 * Empty task that serves as a receptacle for child tasks
 */
export async function groupTask({}:TaskHandlerParams<GroupTaskParam>){

};
