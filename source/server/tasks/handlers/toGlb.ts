import path from "node:path";
import { TaskHandlerParams } from "../types.js";
import { runBlenderScript } from "./exec.js";


export async function toGlb({context: {tasks, vfs, logger}, task:{task_id, data:{filepath}}}:TaskHandlerParams<{filepath: string}>){
  const dir = await vfs.createTaskWorkspace(task_id);
  const dest = path.join(dir, path.basename(filepath, path.extname(filepath))+".glb");
  logger.log("Transform %s to %s", filepath, dest);
  await tasks.run({
    data: {
      script: "obj2gltf.py",
      args: [
        "-i", vfs.absolute(filepath),
        "-o", dest,
      ]
    },
    handler: runBlenderScript,
  });
  return vfs.relative(dest);
}