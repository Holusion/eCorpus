import path from "node:path";
import { BadRequestError } from "../../utils/errors.js";
import { requireFileInput, TaskDefinition, TaskHandlerParams, TaskTypeData } from "../types.js";
import { TLanguageType } from "../../utils/schema/common.js";
import uid from "../../utils/uid.js";
import { createReadStream } from "node:fs";
import { WriteFileParams } from "../../vfs/types.js";
import { AssetDefinition } from "./createDocument.js";
import { TDerivativeQuality } from "../../utils/schema/model.js";



interface UploadFileParams{
  files: {
    path: string,
    name: string,
    type: string,
  }[],
  optimize: boolean,
  scene_name: string,
  user_id: number,
  language?: TLanguageType,
}
/**
 * Analyze an uploaded file and create child task(s) accordingly
 */
export async function handleUploads({task: {task_id, fk_scene_id:scene_id, data:{files, scene_name, user_id, language, optimize}}, context:{signal, config, logger, tasks}}:TaskHandlerParams<UploadFileParams>):Promise<number>{

  //Do some preprocessing to check what we should generate?
  /** @fixme handle other formats */
  const modelFiles = files.filter(m=>m.type ==="model/gltf-binary" || m.name.toLowerCase().endsWith(".glb"));
  const with_lod = 1 < modelFiles.length;
  const qualities :TDerivativeQuality[] = with_lod? ["Thumb", "Low", "Medium", "High"]: ["Thumb", "High"];
  /** @fixme if we want to handle not-voyager-scenes, we should start here */
  if(!modelFiles.length) throw new Error(`No supported file: Can't create a scene`);

  const group = await tasks.group(async function *(tasks){
    for(let file of modelFiles){
      const ext = path.extname(file.name);
      const basename = path.basename(file.name, ext);
      const extname = ext.slice(1).toLowerCase();

      if(file.type === "model/gltf-binary" || extname === "glb"){
        logger.debug("Found a glb file: "+file.name);
        let model_id = uid();
        /** @fixme export raw glb file as Highest quality? */
        for(let quality of qualities){
          logger.debug("Create processing tasks for %s in quality %s", file.name, quality);
          const filename = `${basename}_${quality.toLowerCase()}.glb`;

          const do_optimize = (optimize || quality != "High");
          let optimizeTask:number|null = null;
          if(do_optimize){
            logger.log(`Optimize ${file.name} for quality ${quality}`);
            if(config.enable_rebake_textures)logger.log(`Use experimental textures rebake task`);
            const resizeTask = config.enable_rebake_textures? await tasks.create({type: "bakeGlb", data: {file: file.path, preset: quality}}): null;
            optimizeTask = await tasks.create({type: "transformGlb", data: {preset: quality, file: resizeTask?undefined: file.path}, after: resizeTask?[
              resizeTask
            ]:[]});
          }else{
            logger.debug("Model optimization is disabled");
          }

          let parse = await tasks.create({type: "inspectGlb", data: {file: optimizeTask?undefined:file.path}, after: optimizeTask?[ optimizeTask ]: null});

          let copy = await tasks.create({
            type: "copyFileTask",
            data: {
              scene: scene_id,
              name: filename,
              mime: "model/gltf-binary",
              user_id,
              file: optimizeTask?undefined: file.path,
            },
            after: optimizeTask?[optimizeTask]: null
          });

          yield await tasks.create({
            type: "groupOutputsTask",
            data: {
              id: model_id,
              quality,
              usage: "Web3D",
              filename,
              meta: `$[${parse}]`,
              size: `$[${copy}].size`
            },
            after: [parse, copy],
          });
        }
      }else{
        //This should not happen if we pre-filter models properly. Which we should because it then allows the task to fail early, with better reporting
        logger.error(`Unsupported file type: ${file.name} (${file.type})`);
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




/**
 * Copy a temporary file into a scene
 */
export async function copyFileTask({task:{data: {file, ...params}}, inputs, context: {tasks, vfs, logger}}:TaskHandlerParams<WriteFileParams&{file?: string}>){
  if(!file) logger.debug("Searching inputs for a source file");
  const filepath = file ?? requireFileInput(inputs);
  logger.log(`Copy file from ${filepath} to ${params.scene}/${params.name}`);
  let f = await vfs.copyFile(filepath, params);
  return f;
}