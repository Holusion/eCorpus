import fs from 'node:fs/promises';
import { TaskHandlerParams } from "../types.js";
import { parse_glb } from '../../utils/glTF.js';


interface ParseGlbParams{
  file: string;
}


export async function parseGlbTask({task: {data: {file}}, context: {tasks}}:TaskHandlerParams<ParseGlbParams>){
  return await parse_glb(file);
}


interface OptimizeGlbParams{
  file: string,
}

export async function optimizeGlb({task: {task_id, data},context:{ vfs }}:TaskHandlerParams<OptimizeGlbParams>){
  //Takes a glb file as input, outputs an optimized file
  //It's not yet clear if the output file's path is determined beforehand or generated as an output
  let outputFile = vfs.mktemp(task_id.toString(10));
  await fs.copyFile(data.file, outputFile);
  return outputFile;
};
