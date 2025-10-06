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
export async function handleUploads({task: {task_id, fk_scene_id:scene_id, data:{files, scene_name, user_id, language}}, context:{signal, tasks}}:TaskHandlerParams<UploadFileParams>):Promise<number>{
  

  const group = await tasks.group(async function *(tasks){
    for(let file of files){
      const ext = file.name.split(".").pop()?.toLowerCase();
      if(ext === "glb"){
        yield await tasks.create({type: "optimizeGlb", data: {file: file.path}});
      }
    }
  });

  return await tasks.create({
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
