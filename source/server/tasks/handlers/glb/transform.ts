import path from "node:path";
import { dedup, flatten, getSceneVertexCount, join, meshopt, prune, resample, simplify, sparse, VertexCountMethod, weld } from '@gltf-transform/functions';

import { toktx } from './toktx.js';

import type {TaskLogger} from "../../types.js";

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


function getPreset(quality: TDerivativeQuality): {scale: number, ratio: number, error: number} {
  return {
  "Thumb": {scale: 1/8, ratio: 0, error: 0.05},
  "Low": {scale: 1/4, ratio: 1/4, error: 0},
  "Medium": {scale: 1/2, ratio: 1/2, error: 0.001},
  "High": {scale: 1, ratio: 1, error: 0.0001},
  "Highest": {scale: 1, ratio: 1, error: 0},
  "AR": {scale: 1/4, ratio: 0, error: 0.001},
  }[quality];
}


export async function transformGlb(inputFile: string, {logger, tmpdir, preset:presetName}:TransformGlbParams){
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
  const maxDiffuseSize = getMaxDiffuseSize(document);
  preset.scale =  preset.scale * getBaseTextureSizeMultiplier(maxDiffuseSize);

  const vertexCount = getSceneVertexCount(root.getDefaultScene()!, VertexCountMethod.UPLOAD);
  if(1000000 < vertexCount){
    logger.debug("Allow more aggressive mesh decimation because vertex count is > 1M");
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
    scale: preset.scale,
    mode: "uastc",
    slots: /^(normal|occlusion|metallicRoughness)/,
    tmpdir,
  })));

  await time("Compress Color textures",document.transform(toktx({
    scale: preset.scale,
    mode: "etc1s",
    slots: /^baseColor/,
    tmpdir,
  })));

  let outputFile = path.join(tmpdir, path.basename(inputFile, ".glb")+'_out.glb');


  //Remove draco extension as it is now unused
  let draco = root.listExtensionsUsed().find(e=> e.extensionName === 'KHR_draco_mesh_compression');
  draco?.dispose();

  logger.debug("Output file uses extensions:", root.listExtensionsUsed().map(e=>e.extensionName));

  await io.write(outputFile, document);
  return outputFile;
}