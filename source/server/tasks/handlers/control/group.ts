import {  TaskDefinition, TaskHandlerParams } from "../../types.js";



interface GroupTaskParam{
  children?: Pick<TaskDefinition<any>,"type"|"data">[],
}

/**
 * Empty task that serves as a receptacle for child tasks
 * Can instantiate its own child tasks, but we can also use it as an empty shell and externally attach children to it.
 */
export async function groupTask({task:{fk_scene_id:scene_id, task_id, data:{children}}, context:{tasks}}:TaskHandlerParams<GroupTaskParam>){
  if(!children) return;
  for(let child of children){
    await tasks.create(scene_id, {...child, parent: task_id});
  }
};
