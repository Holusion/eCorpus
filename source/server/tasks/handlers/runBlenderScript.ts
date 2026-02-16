import path from "node:path";
import { TaskHandlerParams } from "../types.js";
import { taskRun } from "../../utils/exec.js";


/**
 * 
 * @param script absolute path to python script to load
 * @param scriptArgs script arguments
 * @param params Spawn parameters
 * @returns 
 */
export async function runBlenderScript({context: {config, logger, signal}, task: {data: {script, args}}}:TaskHandlerParams<{script: string, args: string[]}>){

    return await taskRun("blender", [
      "--background",
      "--offline-mode",
      "--factory-startup",
      "--threads", "1",
      "--addons", "io_scene_gltf2",
      "--python", path.isAbsolute(script)? script: path.join(config.scripts_dir, script),
      "--",
      ...args
    ], {
      logger,
      signal,
    });
}