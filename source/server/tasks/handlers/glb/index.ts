
import { TaskHandlerParams } from "../../types.js";


import { inspectGlb } from './inspect.js';
import { transformGlb } from './transform.js';
import { TDerivativeQuality } from '../../../utils/schema/model.js';
import path from 'node:path';
import { run } from '../../command.js';


interface ParseGlbParams{
  file: string;
}


export async function parseGlbTask({task: {data: {file}}}:TaskHandlerParams<ParseGlbParams>){
  return await inspectGlb(file);
}


interface OptimizeGlbParams{
  file: string,
  preset: TDerivativeQuality,
}


export async function optimizeGlb({task: {task_id, data:{file, preset}}, context:{ vfs, logger }}:TaskHandlerParams<OptimizeGlbParams>):Promise<string>{
  //Takes a glb file as input, outputs an optimized file
  //It's not yet clear if the output file's path is determined beforehand or generated as an output
  let tmpdir = await vfs.createTaskWorkspace(task_id);
  return await transformGlb(file, {
    logger,
    preset,
    tmpdir
  });
};

interface ConvertToGlbParams{
  file: string,
  backface: boolean,
}

export async function convertToGlb({task: {task_id, data:{file, backface}}, context: {vfs}}:TaskHandlerParams<ConvertToGlbParams>):Promise<string>{
  let tmpdir = await vfs.createTaskWorkspace(task_id);
  const filename = path.basename(file);
  const outputFile = path.join(tmpdir, filename);

  let args = [
    "--background",
    "--factory-startup",
    "--addons", "io_scene_gltf2",
    "--python", "blender_export_glb.py",
    "--",
   "-i", file,
   "-o", outputFile,
  ];

  if(backface){
    args.push("--backface");
  }

  await run('blender', args);

  return outputFile;
}
