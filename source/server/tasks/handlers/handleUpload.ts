import path from "node:path";
import { BadRequestError } from "../../utils/errors.js";
import { TaskHandlerParams } from "../types.js";
import { TLanguageType } from "../../utils/schema/common.js";



interface UploadFileParams{
  filepath: string,
  filename: string,
  user_id: number,
  language?: TLanguageType,
}
/**
 * Analyze an uploaded file and create child tasks accordingly
 */
export default async function handleUploadedFile({task: {task_id, fk_scene_id:scene_id, data:{filepath, filename, user_id, language}}, signal, context:{vfs, tasks}}:TaskHandlerParams<UploadFileParams>){
  const ext = filename.split(".").pop()?.toLowerCase();
  if(ext == "glb"){
    await tasks.create(scene_id, {
      type: "appendModel",
      data: {
        file: "",
        name: "",
        quality: "High",
        usage: "Web3D",
        index: 0,
        language,
        user_id,
      },
      parent: task_id,
    });
  }else if(ext == "zip"){
    let unzip = await tasks.create(scene_id, {
      type: "extractZip",
      data: {
        filepath,
      },
      parent: task_id
    });
  }else{
    throw new BadRequestError(`Unhandled file type: ${path.basename(filepath)}`);
  }
};
