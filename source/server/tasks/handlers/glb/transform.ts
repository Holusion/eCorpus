import path from "node:path";
import { dedup, flatten, getSceneVertexCount, join, meshopt, prune, resample, simplify, sparse, VertexCountMethod, weld } from '@gltf-transform/functions';

import { toktx } from './toktx.js';

import type {TaskHandlerParams, TaskLogger} from "../../types.js";

import {io} from './io.js';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { TDerivativeQuality } from "../../../utils/schema/model.js";
import { Document } from "@gltf-transform/core";
import { getBaseTextureSizeMultiplier, getMaxDiffuseSize } from "./inspect.js";

export interface TransformGlbParams{
  logger: TaskLogger;
  preset: TDerivativeQuality;
  tmpdir: string;
}


function getPreset(quality: TDerivativeQuality): {ratio: number, error: number} {
  return {
  "Thumb": {ratio: 0, error: 0.05},
  "Low": {ratio: 1/4, error: 0},
  "Medium": {ratio: 1/2, error: 0.001},
  "High": {ratio: 1, error: 0.0001},
  "Highest": {ratio: 1, error: 0},
  "AR": {ratio: 0, error: 0.001},
  }[quality];
}


interface OptimizeGlbParams{
  file: string,
  preset: TDerivativeQuality,
}



export async function transformGlb({task: {task_id, data:{file, preset}}, context:{ vfs, logger }}:TaskHandlerParams<OptimizeGlbParams>):Promise<string>{
  //Takes a glb file as input, outputs an optimized file
  //It's not yet clear if the output file's path is determined beforehand or generated as an output
  let tmpdir = await vfs.createTaskWorkspace(task_id);

  //Resize textures
  return await processGlb(file, {
    logger,
    preset,
    tmpdir
  });
};

export async function processGlb(inputFile: string, {logger, tmpdir, preset:presetName}:TransformGlbParams){
  logger.debug("Open GLB file using gltf-transform", inputFile);
  const document = await io.read(inputFile); // → Document

  document.setLogger({...logger, info: logger.log});
  
  const root = document.getRoot();
  const scene = root.getDefaultScene();
  if(!scene) throw new Error("Empty glb (no root scene)");

  async function time<T=unknown>(name: string, p: Promise<T>):Promise<T>{
    const t = Date.now();
    let res =  await p;
    logger.log(`${name.padEnd(27,' ')} ${Date.now() - t}ms`);
    return res;
  }

  /**
   * Preset and heuristics
   */
  let preset = getPreset(presetName);

  const vertexCount = getSceneVertexCount(root.getDefaultScene()!, VertexCountMethod.UPLOAD);
  if(1000000 < vertexCount){
    logger.warn("Allow more aggressive mesh decimation because vertex count is > 1M");
    preset.error = preset.error *2;
    preset.ratio = preset.ratio/2;
  }

  logger.log("Optimize geometry");
  

  await time("Flatten", document.transform(flatten()));

  await time("Join", document.transform(join()));

  await time("Weld", document.transform(weld()));

  await time("Simplify", document.transform(simplify({
    error:0,
    ratio:0,
    lockBorder: true,
    simplifier: MeshoptSimplifier,
  })));

  await time("Resample", document.transform(resample()));

  await time("Sparse", document.transform(sparse()));

  await time("Compress meshs", document.transform(meshopt({
    ...preset,
    encoder: MeshoptEncoder,
    level: "medium",
  })));

  /// Textures

  await time("Compress ORM textures",document.transform(toktx({
    mode: "uastc",
    slots: /^(normal|occlusion|metallicRoughness)/,
    tmpdir,
  })));

  await time("Compress Color textures",document.transform(toktx({
    mode: "etc1s",
    slots: /^baseColor/,
    tmpdir,
  })));

  let outputFile = path.join(tmpdir, path.basename(inputFile, ".glb")+'_out.glb');


  //Remove draco extension as it is now unused
  let ext_draco = root.listExtensionsUsed().find(e=> e.extensionName === 'KHR_draco_mesh_compression');
  ext_draco?.dispose();
  //Remove webp extension as it is now unused
  let ext_webp = root.listExtensionsUsed().find(e=> e.extensionName === 'EXT_texture_webp');
  ext_webp?.dispose();

  logger.debug("Output file uses extensions:", root.listExtensionsUsed().map(e=>e.extensionName));

  await io.write(outputFile, document);
  return outputFile;
}