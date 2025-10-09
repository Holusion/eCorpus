import sharp from 'sharp';
import { dedup, flatten, join, meshopt, prune, resample, simplify, sparse, weld } from '@gltf-transform/functions';

import { toktx } from './toktx.js';

import type {TaskLogger} from "../../types.js";

import {io} from './io.js';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

export interface TransformGlbParams{
  logger: TaskLogger;
  simplify: {
    ratio: number;
    error: number;
    lockBorders: boolean;
  },
  size: number;
  tmpdir: string;
}

export async function transformGlb(file: string, {logger, tmpdir, ...params}:TransformGlbParams){
  logger.debug("Open GLB file using gltf-transform", file);
  const document = await io.read(file); // → Document

  document.setLogger({...logger, info: logger.log});
  
  const root = document.getRoot();
  const scene = root.getDefaultScene();
  if(!scene) throw new Error("Empty glb (no root scene)");
  const extensions = root.listExtensions().map(e=>e.extensionName);

  async function time<T=unknown>(name: string, p: Promise<T>):Promise<T>{
    const t = Date.now();
    let res =  await p;
    logger.debug(`${name.padEnd(27,' ')} ${Date.now() - t}ms`);
    return res;
  }

  logger.log("Optimize geometry");
  
  await time("Deduplicate", document.transform(dedup({})));

  await time("Flatten", document.transform(flatten()));

  await time("Join", document.transform(join()));

  await time("Weld", document.transform(weld()));

  await time("Simplify", document.transform(simplify({
    ...params.simplify,
    simplifier: MeshoptSimplifier,
  })));

  await time("Resample", document.transform(resample()));

  await time("Sparse", document.transform(sparse()));

  await time("Compress meshs", document.transform(meshopt({
    encoder: MeshoptEncoder,
    level: "medium"
  })));

  logger.log("Optimize textures");

  await time("ORM textures Compression",document.transform(toktx({
    mode: "uastc",
    slots: /^(normal|occlusion|metallicRoughness)/,
    resize: 'floor-pot',
    tmpdir,
  })));

  await time("Color textures Compression",document.transform(toktx({
    mode: "etc1s",
    slots: /^diffuse/,
    resize: 'floor-pot',
    tmpdir,
  })));
}