import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { meshtinker } from "../utils/meshtinker.js";

/**
 * A GLB written as a `.gltf`, with its `.bin` and images as files, by `meshtinker import`.
 * @returns the glTF's JSON, and its files by path relative to the glTF's folder (the `.gltf` excepted)
 */
export async function glbToGltf(glb: string): Promise<{json: any, files: Record<string, Buffer>}>{
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gltf-"));
  try{
    const gltf = path.join(dir, path.basename(glb).replace(/\.glb$/i, ".gltf"));
    await meshtinker("import", [glb, gltf]);
    const files: Record<string, Buffer> = {};
    for(const entry of await fs.readdir(dir, {recursive: true, withFileTypes: true})){
      if(!entry.isFile()) continue;
      const file = path.join(entry.parentPath, entry.name);
      if(file === gltf) continue;
      files[path.relative(dir, file).split(path.sep).join("/")] = await fs.readFile(file);
    }
    return {json: JSON.parse(await fs.readFile(gltf, "utf-8")), files};
  }finally{
    await fs.rm(dir, {recursive: true, force: true});
  }
}
