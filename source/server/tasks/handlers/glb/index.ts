import fs from 'node:fs/promises';
import { TaskHandlerParams } from "../../types.js";

import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

import { inspectGlb } from './inspect.js';
import { transformGlb, TransformGlbParams } from './transform.js';
import { TDerivativeQuality } from '../../../utils/schema/model.js';


interface ParseGlbParams{
  file: string;
}


const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });



export async function parseGlbTask({task: {data: {file}}}:TaskHandlerParams<ParseGlbParams>){
  return await inspectGlb(file);
}


interface OptimizeGlbParams{
  file: string,
  preset: TDerivativeQuality,
}


export async function optimizeGlb({task: {task_id, data:{file, preset}}, context:{ vfs, logger }}:TaskHandlerParams<OptimizeGlbParams>):Promise<string>{
  //Takes a glb file as input, outputs an optimized file
  //It's not yet clear if the output file's path is determined beforehand or generated as an output
  let tmpdir = await vfs.createTaskWorkspace(task_id);
  return await transformGlb(file, {
    logger,
    preset,
    tmpdir
  });
};
