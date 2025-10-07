import fs from 'node:fs/promises';
import { TaskHandlerParams } from "../types.js";



interface OptimizeGlbParams{
  file: string,
}

export async function optimizeGlb({task: {fk_scene_id:scene_id, task_id, data},context:{ signal, vfs }}:TaskHandlerParams<OptimizeGlbParams>){
  //Takes a glb file as input, outputs an optimized file
  //It's not yet clear if the output file's path is determined beforehand or generated as an output
  let outputFile = vfs.mktemp(task_id.toString(10));
  await fs.copyFile(data.file, outputFile);
  return outputFile;
};
