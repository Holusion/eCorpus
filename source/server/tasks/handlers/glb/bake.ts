import path from "node:path";
import {requireFileInput, type ProcessFileParams, type TaskHandlerParams, type TaskLogger} from "../../types.js";
import type { TDerivativeQuality } from "../../../utils/schema/model.js";
import { run, runBlenderScript, taskRun } from '../../command.js';

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



export async function bakeGlb({task: {task_id, data:{file, preset:presetName}}, inputs, context:{ vfs, logger, config, signal }}:TaskHandlerParams<ProcessFileParams>):Promise<string>{


  const inputFile = file ?? requireFileInput(inputs);
  let tmpdir = await vfs.createTaskWorkspace(task_id);
  const outputFile = path.join(tmpdir, path.basename(inputFile).replace(/\.glb$/i, "")+".glb");

  logger.debug("Bake textures for %s with preset %s", inputFile, presetName);

  const preset = getPreset(presetName);

  let args = [
    "-i", inputFile,
    "-o", outputFile,
    "--scale", preset.scale.toString(10),
  ];

  await runBlenderScript(path.join(config.scripts_dir, "bake.py"), args, {
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