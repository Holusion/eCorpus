import path from "node:path";
import type {TaskHandlerParams, TaskLogger} from "../../types.js";
import type { TDerivativeQuality } from "../../../utils/schema/model.js";
import { run, taskRun } from '../../command.js';

export interface TransformGlbParams{
  logger: TaskLogger;
  preset: TDerivativeQuality;
  tmpdir: string;
}

export interface BakeFileParams{
  logger: TaskLogger;
  preset: TDerivativeQuality;
  tmpdir: string;
  scripts_dir: string;
  inputFile: string;
  outputFile: string;
  backface: boolean;
  signal?: AbortSignal;
}

function getPreset(quality: TDerivativeQuality): {scale: number} {
  return {
  "Thumb": {scale: 1/8},
  "Low": {scale: 1/4},
  "Medium": {scale: 1/2},
  "High": {scale: 1},
  "Highest": {scale: 1},
  "AR": {scale: 1/4},
  }[quality];
}

interface BakeGlbParams{
  file: string,
  preset: TDerivativeQuality,
}



export async function bakeGlb({task: {task_id, data:{file: inputFile, preset:presetName}}, context:{ vfs, logger, config, signal }}:TaskHandlerParams<BakeGlbParams>):Promise<string>{

  let tmpdir = await vfs.createTaskWorkspace(task_id);

  logger.debug("Bake textures for %s to %dx%d with blender", inputFile);
  const outputFile = path.join(tmpdir, path.basename(inputFile, ".glb")+'_out.glb');
  const preset = getPreset(presetName);

  let args = [
    "--background",
    "--factory-startup",
    "--addons", "io_scene_gltf2",
    "--python", path.join(config.scripts_dir, "bake.py"),
    "--",
    "-i", inputFile,
    "-o", outputFile,
    "--scale", preset.scale.toString(10),
  ];

  await taskRun('blender', args, {
    logger,
    signal,
    env: {
      ...process.env,
      TMPDIR: tmpdir,
    },
    cwd: tmpdir
  });

  return outputFile;
}