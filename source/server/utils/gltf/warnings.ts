import type { InspectReport } from "../meshtinker.js";
import { localize, LocalizedOutput } from "../i18n.js";
import { listDiffuseImages } from "./inspect.js";

/** Stable, locale-independent findings returned in model upload results. */
export type ModelWarning = "png-images" | "large-textures" | "large-combined-diffuse-maps";

/** Matches the maximum texture dimension of the High optimization preset. */
export const LARGE_TEXTURE_SIZE = 4096;

/**
 * Compact model analysis report, from a `meshtinker inspect` report.
 * This may grow to encompass any well-known model issues that we'd like to report at upload time.
 */
export function getModelWarnings(report: Pick<InspectReport, "images">): ModelWarning[] {
  const images = report.images;
  const hasPng = images.some(image => image.mimeType === "image/png");
  const hasLargeTextures = images.some(({ width, height }) => Math.max(width ?? 0, height ?? 0) > LARGE_TEXTURE_SIZE);
  //Each image is listed once, even when several materials share it.
  const diffuseMaps = listDiffuseImages(report);
  const diffusePixels = diffuseMaps.reduce((sum, { width, height }) => sum + (width ?? 0) * (height ?? 0), 0);
  const warnings: ModelWarning[] = [];
  if (hasPng) warnings.push("png-images");
  if (hasLargeTextures) warnings.push("large-textures");
  if (diffuseMaps.length > 1 && diffusePixels > LARGE_TEXTURE_SIZE ** 2) {
    warnings.push("large-combined-diffuse-maps");
  }
  return warnings;
}

/** What users can do about each warning. Several warnings may share the same advice */
const recommendations: Record<ModelWarning, string> = {
  "png-images": "modelWarnings.recommend-optimize",
  "large-textures": "modelWarnings.recommend-optimize",
  "large-combined-diffuse-maps": "modelWarnings.recommend-reexport",
};

/**
 * Model warnings as they are reported to users: findings as `warnings`, and advice as `messages`,
 * each piece of advice given once.
 */
export function localizeModelWarnings(warnings: ModelWarning[]): Required<LocalizedOutput> {
  return {
    warnings: warnings.map(w => localize(`modelWarnings.${w}`).toData()),
    messages: [...new Set(warnings.map(w => recommendations[w]))].map(key => localize(key).toData()),
  };
}
