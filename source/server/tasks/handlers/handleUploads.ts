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
      const ext = path.extname(file.name);
      const basename = path.basename(file.name, ext);
      const extname = ext.slice(1).toLowerCase();
      
      /** @fixme for extensionless files, we can check for known magic bytes */

      if(extname === ".glb"){
        let model_id = uid();
        for(let quality of ["Thumb", "Low", "Medium", "High"]){
          let optimize = await tasks.create({type: "optimizeGlb", data: {file: file.path}});
          yield optimize;
          yield await tasks.create({
            type: "mapOutputsTask",
            data: {
              id: model_id,
              quality,
              usage: "Web3D",
              filepath: "$[0]",
              filename: `${basename}_${quality.toLowerCase()}.glb`,
            },
            after: [optimize],
          });
        }
      }
    }
  });

  return await tasks.create({
    type: "createDocument",
    data: {
      name: scene_name,
      user_id,
      language,
    },
    after: [group],
  });

};
