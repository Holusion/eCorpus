import path from "node:path";
import { BadRequestError } from "../../utils/errors.js";
import { TaskDefinition, TaskHandlerParams, TaskTypeData } from "../types.js";
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
export async function handleUploads({task: {task_id, fk_scene_id:scene_id, data:{files, scene_name, user_id, language}}, signal, context:{vfs, tasks}}:TaskHandlerParams<UploadFileParams>):Promise<number>{
  
  let models = [];
  for(let file of files){
    const ext = file.name.split(".").pop()?.toLowerCase();
    if(ext === "glb"){
      let optimize = await tasks.create(scene_id, {type: "optimizeGlb", data: {file: file.path},  parent: task_id});
    }
  }




  const children = files.map<Pick<TaskDefinition, "type"|"data">>(file =>{
    const ext = file.name.split(".").pop()?.toLowerCase();
    if(ext == "glb"){
      return {
        type: "optimizeGlb",
        data: {
          file: file.path
        },
      } satisfies Pick<TaskDefinition<TaskTypeData<"optimizeGlb">>, "data"|"type">;
    }else{
      throw new BadRequestError(`Unhandled file type: ${path.basename(file.path)}`);
    }
  });

  const group = await tasks.create(scene_id, {type: "reduceTasks", data:{tasks: children}, after: [task_id]});

  return await tasks.create(scene_id,  {
    type: "createDocument",
    data: {
      models: [],
      name: scene_name,
      user_id,
      language,
    },
    after: [group],
  });

};
