
import path from 'node:path';
import { run } from '../../command.js';



export interface ConvertFileParams{
  tmpdir: string;
  scripts_dir: string;
  inputFile: string;
  outputFile: string;
  backface: boolean;
  signal?: AbortSignal;
}

export async function convertModelFile({tmpdir, scripts_dir, inputFile, outputFile, backface, signal}: ConvertFileParams){
  if(path.extname(outputFile)!== ".glb") throw new Error("Unsupported file extension: "+outputFile);
  let args = [
    "--background",
    "--factory-startup",
    "--addons", "io_scene_gltf2",
    "--python", path.join(scripts_dir, "blender_export.py"),
    "--",
   "-i", inputFile,
   "-o", outputFile,
  ];

  if(backface){
    args.push("--backface");
  }

  await run('blender', args, {
    signal,
    env: {
      ...process.env,
      TMPDIR: tmpdir,
    }
  });

}