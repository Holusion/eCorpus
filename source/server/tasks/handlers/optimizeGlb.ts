import path from "node:path";

import {type ProcessFileParams, type TaskHandlerParams, FileArtifact} from "../types.js";
import { TDerivativeQuality } from "../../utils/schema/model.js";
import { meshtinker, type OptimizeReport } from "../../utils/meshtinker.js";


/**
 * meshtinker's `--quality` for a derivative quality. Its qualities are named after eCorpus's.
 * meshtinker has no AR quality: Medium has the same simplification error, and textures of at most 2048.
 * Whether AR gets a preset of its own waits for an experiment in meshtinker.
 */
function getQuality(quality: TDerivativeQuality): string {
  return quality === "AR" ? "Medium" : quality;
}


/**
 * Optimize a glTF or GLB model into a GLB, with `meshtinker optimize`.
 * It picks the steps that suit the model and the quality.
 * @throws {MeshtinkerError} if the model is rejected, or meshtinker failed
 */
export async function optimizeGlb({task: {task_id, data:{fileLocation, preset: presetName}}, context:{ vfs, logger, signal }}:TaskHandlerParams<ProcessFileParams>):Promise<FileArtifact>{
  if(!fileLocation) throw new Error(`A file is required for this task to run`);

  const tmpdir = await vfs.createTaskWorkspace(task_id);
  const inputFile = vfs.absolute(fileLocation);
  const outputFile = path.join(tmpdir, path.basename(inputFile).replace(/\.[^.]*$/, "")+".glb");
  const quality = getQuality(presetName);

  logger.log("Optimize with quality %s using meshtinker", quality);
  logger.debug("Input file:", inputFile);
  const report = await meshtinker<OptimizeReport>("optimize", [
    "--quality", quality,
    "--tmp-dir", tmpdir,
    inputFile,
    outputFile,
  ], {signal, logger});

  for(const step of report.steps){
    logger.debug(`${step.command.padEnd(12, " ")} ${Math.round(step.seconds*1000)}ms${step.exitCode ? ` (exit code ${step.exitCode})` : ""}`);
  }
  logger.log(`Optimized in ${report.seconds.toFixed(1)}s: ${report.input.byteSize} → ${report.output.byteSize} bytes`);
  return {fileLocation: vfs.relative(outputFile)};
};
