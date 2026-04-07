import { getBounds, getPrimitiveVertexCount, VertexCountMethod } from '@gltf-transform/functions';

import { Document, ImageUtils, PropertyType } from '@gltf-transform/core';

/**
 * Model boundaries. Copied from DPO-Voyager's `IBoundingBox` definition
 * 
 * It is generally implied that either min/max are finite or the whole bounding box is null.
 */
export interface BoundingBox {
  min: [number, number, number],
  max: [number, number, number],
}

export interface SceneDescription {
  name: string,
  /** Bounding box. `null` when not finite (ie. the document has no faces to get bounds from) */
  bounds: BoundingBox | null,
  imageSize: number,
  numFaces: number,
  extensions: string[],
}

export function inspectDocument(document: Document): SceneDescription {
  const root = document.getRoot();
  const scene = root.getDefaultScene();
  const name = scene?.listChildren().map((node => node.getName())).find(n => !!n) ?? scene?.getName() ?? '';
  const extensions = root.listExtensionsUsed().map(e => e.extensionName);
  const rawBounds = scene ? getBounds(scene) : null;
  //We don't expect the possibility of a bounding box where only _some_ coordinates are finite so we test just one.
  const bounds = Number.isFinite(rawBounds?.min[0]) ? rawBounds : null;
  let numFaces = 0;
  for (const mesh of root.listMeshes()) {
    for (let primitive of mesh.listPrimitives()) {
      const mode = primitive.getMode();
      if (mode < 4) continue; // POINTS and LINES* have no faces
      if (!primitive.getAttribute("POSITION")) continue; // no geometry data
      numFaces += Math.floor(getPrimitiveVertexCount(primitive, VertexCountMethod.RENDER) / 3);
      if (4 < mode) numFaces -= 2; //TRIANGLES_STRIP and TRIANGLE_FAN have two shared vertices
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


/**
 * Get the largest diffuse size in the document
 * @param document 
 * @returns 
 */
export function getMaxDiffuseSize(document: Document): number {
  const root = document.getRoot();
  let imageSize = 0
  for (const texture of root.listTextures()) {
    const slots = document
      .getGraph()
      .listParentEdges(texture)
      .filter((edge) => edge.getParent().propertyType !== PropertyType.ROOT)
      .map((edge) => edge.getName());

    if (slots.indexOf("baseColorTexture") === -1) continue; //Ignore textures not used as baseColor

    const resolution = ImageUtils.getSize(texture.getImage()!, texture.getMimeType());
    if (resolution) {
      imageSize = Math.max(imageSize, ...resolution);
    }
  }
  return imageSize;
}

export function getBaseTextureSizeMultiplier(originalMaxSize: number) {
  //How much should we scale down to have High be a 8k texture?
  const baseDivider = Math.max(1, originalMaxSize / 8192);
  return 1 / baseDivider;
}