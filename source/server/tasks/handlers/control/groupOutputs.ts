import { mapShape } from "../../processor.js";
import { TaskHandlerParams } from "../../types.js";


/**
 * Returns all results once all child tasks have completed.
 * Do not use directly, but through `TaskListener.group()` or inside tasks as `context.tasks.group()`
 */
export async function groupOutputsTask({task:{after, data}, context:{logger, tasks}}:TaskHandlerParams<any>):Promise<any[]> {
  logger.debug("Group outputs for tasks",  after);

  async function resolve(id: number){
    let {output} = await tasks.getTask(id);
    logger.debug("Resolve output for #",  id);
    if(typeof output === "number") return await resolve(output);
    return output;
  }

  let outputs = await Promise.all(after.map(resolve));
  if(data && Object.keys(data).length){
    logger.debug(`Use schema  ${JSON.stringify(data)}`)
    logger.debug(`Map group outputs ${JSON.stringify(outputs)}`);
    return mapShape(data, outputs);
  }else{
    logger.debug(`Grouped outputs: ${JSON.stringify(outputs)}`);
    return outputs;
  }
};