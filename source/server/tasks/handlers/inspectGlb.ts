import type { FileArtifact, TaskHandlerParams } from '../types.js';
import { meshtinker, type InspectReport } from '../../utils/meshtinker.js';
import { describeModel } from '../../utils/gltf/inspect.js';
import { getModelWarnings, localizeModelWarnings } from '../../utils/gltf/warnings.js';


/**
 * Inspect a glTF or GLB model to gather its main attributes, with `meshtinker inspect`.
 * Unknown required extensions don't prevent it: the model may still be usable by the viewer.
 * @throws {MeshtinkerError} if the model is rejected (`rejected`), or meshtinker failed
 */
export async function inspectGlb({context: {vfs, logger, signal}, task: {data: {fileLocation}}}:TaskHandlerParams<FileArtifact>){
  const report = await meshtinker<InspectReport>("inspect", [vfs.absolute(fileLocation)], {signal, logger});
  return { ...describeModel(report), ...localizeModelWarnings(getModelWarnings(report)) };
}
