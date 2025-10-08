import path from "node:path";
import { BadRequestError } from "../../utils/errors.js";
import { TaskDefinition, TaskHandlerParams, TaskTypeData } from "../types.js";
import { TLanguageType } from "../../utils/schema/common.js";
import uid from "../../utils/uid.js";
import { createReadStream } from "node:fs";
import { WriteFileParams } from "../../vfs/types.js";



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
export async function handleUploads({task: {task_id, fk_scene_id:scene_id, data:{files, scene_name, user_id, language}}, context:{signal, logger, tasks}}:TaskHandlerParams<UploadFileParams>):Promise<number>{

  const group = await tasks.group(async function *(tasks){
    for(let file of files){
      const ext = path.extname(file.name);
      const basename = path.basename(file.name, ext);
      const extname = ext.slice(1).toLowerCase();
      
      /** @fixme for extensionless files, we can check for known magic bytes */

      if(extname === "glb"){
        logger.debug("Found a glb file: "+file.name);
        let model_id = uid();
        for(let quality of ["High", "Medium", "Low", "Thumb"]){
          logger.debug("Create processing tasks for %s in quality %s", file.name, quality);
          const filename = `${basename}_${quality.toLowerCase()}.glb`;
          let optimize = await tasks.create({type: "optimizeGlb", data: {file: file.path}});
          
          let parse = await tasks.create({type: "parseGlbTask", data: {file: "$[0]"}, after: [optimize]});

          let copy = await tasks.create({
            type: "copyFileTask",
            data: {
              scene: scene_id,
              name: filename,
              mime: "model/gltf-binary",
              user_id,
              filepath: '$[0]' as any,
            },
            after: [optimize]
          });
          yield await tasks.create({
            type: "groupOutputsTask",
            data: {
              id: model_id,
              quality,
              usage: "Web3D",
              filepath: "$[0]",
              filename,
              meta: "$[1]",
            },
            after: [optimize, parse, copy],
          });
        }
      }else{
        logger.warn("Ignore unsupported file: %s (%s)",file.name, extname);
      }
    }
  });

  return await tasks.create({
    type: "createDocument",
    data: {
      models: "$[0]" as any,
      name: scene_name,
      user_id,
      language,
    },
    after: [group],
  });
};




/**
 * Copy a temporary file into a scene
 */
export async function copyFileTask({task:{after, data: {filepath, ...params}}, context: {tasks, vfs, logger}}:TaskHandlerParams<WriteFileParams&{filepath: string}>){
  logger.log(`Copy file from ${filepath} to ${params.scene}/${params.name}`);
  let f = await vfs.copyFile(filepath, params);
  return f;
}