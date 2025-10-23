
import path from 'node:path';
import { run, taskRun } from '../../command.js';
import { TaskHandlerParams } from '../../types.js';



export interface ConvertFileParams{
  tmpdir: string;
  scripts_dir: string;
  inputFile: string;
  outputFile: string;
  backface: boolean;
  signal?: AbortSignal;
}

interface ConvertToGlbParams{
  file: string,
  backface: boolean,
}


export async function convertToGlb({task: {task_id, data:{file, backface}}, context: { vfs, config, logger }}:TaskHandlerParams<ConvertToGlbParams>):Promise<string>{
  let tmpdir = await vfs.createTaskWorkspace(task_id);
  const filename = path.basename(file);
  const outputFile = path.join(tmpdir, filename);

  let args = [
    "--background",
    "--factory-startup",
    "--addons", "io_scene_gltf2",
    "--python", path.join(config.scripts_dir, "obj2gltf.py"),
    "--",
   "-i", file,
   "-o", outputFile,
  ];

  if(backface){
    args.push("--backface");
  }

  await taskRun('blender', args, {
    logger,
  });

  return outputFile;
}
