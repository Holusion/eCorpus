import fs from 'node:fs/promises';
import { TaskHandlerParams } from "../../types.js";

import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

import { inspectGlb } from './inspect.js';


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
}

export async function optimizeGlb({task: {task_id, data},context:{ vfs }}:TaskHandlerParams<OptimizeGlbParams>){
  //Takes a glb file as input, outputs an optimized file
  //It's not yet clear if the output file's path is determined beforehand or generated as an output
  let outputFile = vfs.mktemp(task_id.toString(10));
  await fs.copyFile(data.file, outputFile);
  return outputFile;
};
