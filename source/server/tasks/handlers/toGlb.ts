import path from "node:path";
import fs from "node:fs/promises";
import obj2gltf from "obj2gltf";
import { FileArtifact, TaskHandlerParams } from "../types.js";
import { BadRequestError } from "../../utils/errors.js";
import { getMimeType } from "../../utils/filetypes.js";


export async function toGlb({context: {tasks, vfs, logger}, task:{task_id, data:{fileLocation}}}:TaskHandlerParams<FileArtifact>){
  const ext = path.extname(fileLocation).toLowerCase();
  const mime = getMimeType(fileLocation);
  if(mime === "model/obj"){
    return await tasks.run({
      handler: objToGlb,
      data: {fileLocation},
    });
  }else{
    throw new BadRequestError(`Unsupported file extension: ${ext}`);
  }
}

export async function objToGlb({context: {vfs}, task: {task_id, data:{fileLocation}}}:TaskHandlerParams<FileArtifact>):Promise<FileArtifact>{

  const inputFilename = path.basename(fileLocation);
  const destFilename = (/\.obj$/i.test(inputFilename)? inputFilename.slice(0, -4): inputFilename) + ".glb"
  const dir = await vfs.createTaskWorkspace(task_id);
  const destPath = path.join(dir, destFilename);
  const gltfBuffer = await obj2gltf(vfs.absolute(fileLocation), {
    binary: true,
    secure: true, //won't read outside of the source file's directory
  });
  await fs.writeFile(vfs.absolute(destPath), gltfBuffer);
  return {
    fileLocation: vfs.relative(destPath),
  }
}
