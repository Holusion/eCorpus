import path from "node:path";
import { BadRequestError } from "../../utils/errors.js";
import { TaskDefinition, TaskHandlerParams } from "../types.js";
import { TLanguageType } from "../../utils/schema/common.js";
import uid from "../../utils/uid.js";



interface UploadFileParams{
  files: {
    path: string,
    name: string,
  }[],
  scene_name: string,
  user_id: number,
  language?: TLanguageType,
}
/**
 * Analyze an uploaded file and create child task(s) accordingly
 */
export async function handleUploads({task: {task_id, fk_scene_id:scene_id, data:{files, scene_name, user_id, language}}, signal, context:{vfs, tasks}}:TaskHandlerParams<UploadFileParams>){
  
  const children = files.map<Pick<TaskDefinition, "type"|"data">>(file =>{
    const ext = file.name.split(".").pop()?.toLowerCase();
    if(ext == "glb"){
      return {
        type: "createDocument",
        data: {
          models: [],
          name: scene_name,
          user_id,
          language,
        },
      };
    }else{
      throw new BadRequestError(`Unhandled file type: ${path.basename(file.path)}`);
    }
  });

  const group = await tasks.create(scene_id, {type: "reduceTasks", data:{tasks: children}, parent: task_id});

};
