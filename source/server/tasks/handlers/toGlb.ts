import path from "node:path";
import { FileArtifact, TaskHandlerParams } from "../types.js";
import { runBlenderScript } from "./exec.js";


export async function toGlb({context: {tasks, vfs, logger}, task:{task_id, data:{fileLocation}}}:TaskHandlerParams<FileArtifact>){
  const dir = await vfs.createTaskWorkspace(task_id);
  const dest = path.join(dir, path.basename(fileLocation, path.extname(fileLocation))+".glb");
  logger.log("Transform %s to %s", fileLocation, dest);
  await tasks.run({
    data: {
      script: "obj2gltf.py",
      args: [
        "-i", vfs.absolute(fileLocation),
        "-o", dest,
      ]
    },
    handler: runBlenderScript,
  });
  return vfs.relative(dest);
}