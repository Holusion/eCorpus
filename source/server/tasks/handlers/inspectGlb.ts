
import type { FileArtifact, TaskHandlerParams } from '../types.js';
import { getModelWarnings } from '../../utils/gltf/warnings.js';



/**
 * Parse a glb file to gather its main attributes
 * @param param0 
 * @returns 
 */
export async function inspectGlb({context: {vfs, logger}, task: {data: {fileLocation}}}:TaskHandlerParams<FileArtifact>){
  const {io} = await import("../../utils/gltf/io.js");
  const {inspectDocument} = await import("../../utils/gltf/inspect.js");
  const filepath = vfs.absolute(fileLocation);
  const document = await io.read(filepath).catch(async (e) => {
    if (!/Missing required extension/.test(e?.message)) throw e;
    //The model might still be usable by the viewer: ignore unsupported extensions' data and inspect what's left
    //Supported extensions are enabled from extensionsUsed so it's safe to clear extensionsRequired
    logger.warn(`${e.message} Model data that depends on it will be ignored`);
    const jsonDoc = await io.readAsJSON(filepath);
    delete jsonDoc.json.extensionsRequired;
    return await io.readJSON(jsonDoc);
  }); // → Document
  return { ...inspectDocument(document), warnings: getModelWarnings(document) };
}

