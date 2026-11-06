import timers from "node:timers/promises";

import { BadRequestError } from "../../utils/errors.js";
import { TaskHandlerParams } from "../types.js";


/** Upper bound on {@link DelayTaskParams.ms}: well under the scheduler's watchdog */
export const MAX_DELAY_MS = 10 * 60 * 1000;

export interface DelayTaskParams{
  /** How long to wait, in milliseconds. Defaults to 0. */
  ms?: number;
  /** Fail with this message once the delay is over, instead of succeeding */
  fail?: string;
}

/**
 * Wait, then succeed or fail on demand. Has no side effects besides its own task row and logs,
 * which makes it a safe subject for tests and demos of anything that follows tasks (eg. notifications).
 * Stops early, as an error, when the task is aborted.
 */
export async function delayTask({ task: { data: { ms = 0, fail } }, context: { logger, signal } }: TaskHandlerParams<DelayTaskParams>): Promise<{ ms: number }>{
  if(!Number.isInteger(ms) || ms < 0 || MAX_DELAY_MS < ms){
    throw new BadRequestError(`ms must be an integer between 0 and ${MAX_DELAY_MS}`);
  }
  if(typeof fail !== "undefined" && typeof fail !== "string"){
    throw new BadRequestError(`fail must be a string`);
  }
  logger.log(`Waiting ${ms}ms`);
  await timers.setTimeout(ms, undefined, { signal });
  if(typeof fail === "string"){
    logger.error(`Failing as requested: ${fail}`);
    throw new Error(fail);
  }
  logger.log(`Done waiting`);
  return { ms };
}
