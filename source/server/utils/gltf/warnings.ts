import { Document, ImageUtils } from "@gltf-transform/core";

/** Stable, locale-independent findings returned in model upload results. */
export type ModelWarning = "png-images" | "large-textures" | "large-combined-diffuse-maps";

/** Matches the maximum texture dimension of the High optimization preset. */
export const LARGE_TEXTURE_SIZE = 4096;

/**
 * Compact model analysis report.
 * This may grow to encompass any well-known model issues that we'd like to report at upload time.
 */
export function getModelWarnings(document: Document): ModelWarning[] {
  let hasPng = false;
  let hasLargeTextures = false;
  // Count each base-color texture once, even when several materials share it.
  const diffuseMaps = new Set(document.getRoot().listMaterials()
    .map(material => material.getBaseColorTexture()).filter(texture => texture !== null));
  let diffusePixels = 0;
  for (const texture of document.getRoot().listTextures()) {
    hasPng ||= texture.getMimeType() === "image/png";
    const image = texture.getImage();
    const size = image && ImageUtils.getSize(image, texture.getMimeType());
    if (size && Math.max(...size) > LARGE_TEXTURE_SIZE) hasLargeTextures = true;
    if (size && diffuseMaps.has(texture)) diffusePixels += size[0] * size[1];
  }
  const warnings: ModelWarning[] = [];
  if (hasPng) warnings.push("png-images");
  if (hasLargeTextures) warnings.push("large-textures");
  if (diffuseMaps.size > 1 && diffusePixels > LARGE_TEXTURE_SIZE ** 2) {
    warnings.push("large-combined-diffuse-maps");
  }
  return warnings;
}
