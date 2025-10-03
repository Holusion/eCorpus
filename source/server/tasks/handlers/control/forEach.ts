
import { TaskDefinition, TaskHandlerParams } from "../../types.js";



interface ForEachTaskParams{
  task: Pick<TaskDefinition<any>,"type"|"data">,
}

/**
 * Create an array of tasks and wait for them to complete
 */
export async function forEachTask({task: {task_id, after, fk_scene_id:scene_id, data:{task: child_task}}, signal, context:{vfs, tasks}}:TaskHandlerParams<ForEachTaskParams>) :Promise<any[]>{
  if(typeof after !== "number") throw new Error(`mapTask must have a valid "after" constraint. Found ${after}`);
  let source = await tasks.getTask(after);
  if(!source.output) throw new Error("Previous task has no output");
  if(!Array.isArray(source.output)) throw new Error("Previous task's output is not an array");

  return await Promise.all(source.output.map(async (el)=>{
    return await tasks.create(scene_id, {...child_task, parent: task_id});
  }));
};
