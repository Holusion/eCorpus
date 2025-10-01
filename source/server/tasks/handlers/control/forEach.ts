
import { TaskDefinition, TaskHandlerParams } from "../../types.js";



interface ForEachTaskParams{
  children: Pick<TaskDefinition<any>,"type"|"data">[],
}

/**
 * Analyze an uploaded file and create child tasks accordingly
 */
export async function forEachTask({task: {task_id, fk_scene_id:scene_id, data:{children}}, signal, context:{vfs, tasks}}:TaskHandlerParams<ForEachTaskParams>){
  await Promise.all(children.map(async (def)=>{
    let child_task = await tasks.create(scene_id, {...def, parent: task_id});
    await tasks.wait(child_task.task_id);
  }));
};
