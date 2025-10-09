import fs from 'fs/promises';
import {getBounds, getPrimitiveVertexCount, VertexCountMethod} from '@gltf-transform/functions';
import {io} from './io.js';
import { ImageUtils, PropertyType } from '@gltf-transform/core';


export interface SceneDescription{
  name: string,
  bounds :{ 
    min: [number, number, number], 
    max: [number, number, number]
  },
  imageSize: number,
  numFaces: number,
  extensions: string[],
}


const MeshPrimitiveMode = {
  "POINTS": 0, //Faces=0.
  "LINES": 1, //Faces=0.
  "LINE_LOOP": 2, //Faces=0.
  "LINE_STRIP": 3, //Faces=0.
  "TRIANGLES": 4, //Faces=Index Count/3. (Most common for static meshes).
  "TRIANGLES_STRIP": 5, //Faces=Index Count−2.
  "TRIANGLE_FAN": 6, //Faces=Index Count−2.
}
/**
 * See {@link https://github.com/donmccurdy/glTF-Transform/blob/main/packages/functions/src/inspect.ts }
 */
export async function inspectGlb(file: string):Promise<SceneDescription>{
  const document = await io.read(file); // → Document
  const root = document.getRoot();
  const scene = root.getDefaultScene();
  const name = scene?.listChildren().map((node=>node.getName())).find(n=>!!n) ?? scene?.getName() ?? '';
  if(!scene) throw new Error("Empty glb (no root scene)");
  const extensions = root.listExtensionsUsed().map(e=>e.extensionName);
  const bounds = getBounds(scene);
  let numFaces = 0;
  for(const mesh of root.listMeshes()){
    for(let primitive of mesh.listPrimitives()){
      const mode = primitive.getMode();
      if(mode < 4) continue; // POINTS and LINES* have no faces
      numFaces += Math.floor(getPrimitiveVertexCount(primitive, VertexCountMethod.RENDER) / 3);
      if(4 < mode) numFaces -= 2; //TRIANGLES_STRIP and TRIANGLE_FAN have two shared vertices
    }
  }

  let imageSize = 0
  for(const texture of root.listTextures()){
    const slots = document
				.getGraph()
				.listParentEdges(texture)
				.filter((edge) => edge.getParent().propertyType !== PropertyType.ROOT)
				.map((edge) => edge.getName());

    if(slots.indexOf("baseColorTexture") === -1) continue; //Ignore textures not used as baseColor

		const resolution = ImageUtils.getSize(texture.getImage()!, texture.getMimeType());
    if(resolution){
      imageSize = Math.max(imageSize, ...resolution);
    }
  }


  return {
    name,
    bounds,
    imageSize,
    numFaces,
    extensions,
  }
}