
import type { FileArtifact, TaskHandlerParams } from '../types.js';



/**
 * Parse a glb file to gather its main attributes
 * @param param0 
 * @returns 
 */
export async function inspectGlb({context: {vfs}, task: {data: {fileLocation}}}:TaskHandlerParams<FileArtifact>){
  const {io} = await import("../../utils/gltf/io.js");
  const {inspectDocument} = await import("../../utils/gltf/inspect.js");
  const document = await io.read(vfs.absolute(fileLocation)); // → Document
  return inspectDocument(document);
}

