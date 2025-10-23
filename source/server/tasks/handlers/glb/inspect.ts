import fs from 'fs/promises';
import {getBounds, getPrimitiveVertexCount, VertexCountMethod} from '@gltf-transform/functions';
import {io} from './io.js';
import { Document, ImageUtils, PropertyType } from '@gltf-transform/core';
import { TaskHandlerParams } from '../../types.js';


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


interface ParseGlbParams{
  file: string;
}


export async function inspectGlb({task: {data: {file}}}:TaskHandlerParams<ParseGlbParams>){

  const document = await io.read(file); // → Document
  return inspectDocument(document);
}


export function inspectDocument(document: Document): SceneDescription{
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

  let imageSize = getMaxDiffuseSize(document);


  return {
    name,
    bounds,
    imageSize,
    numFaces,
    extensions,
  }

}



export function getMaxDiffuseSize(document: Document) :number{
  const root = document.getRoot();
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
  return imageSize;
}

export function getBaseTextureSizeMultiplier(originalMaxSize: number){
  //How much should we scale down to have High be a 8k texture?
  const baseDivider = Math.max(1, originalMaxSize / 8192);
  return 1/baseDivider;
}
