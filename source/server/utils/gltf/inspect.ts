import type { InspectReport } from "../meshtinker.js";

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

/**
 * What eCorpus keeps of a model's `meshtinker inspect` report
 * (see the "Mapping from eCorpus" table of meshtinker's docs/inspect-report.md)
 */
export function describeModel(report: InspectReport): SceneDescription {
  return {
    name: report.scene?.firstNamedRootNode ?? report.scene?.name ?? "",
    bounds: report.scene?.bounds ?? null,
    imageSize: getMaxDiffuseSize(report),
    numFaces: report.geometry.faces,
    extensions: report.extensions.used,
  };
}

/** Images a base color uses */
export function listDiffuseImages(report: Pick<InspectReport, "images">) {
  return report.images.filter(image => image.uses.some(use => use.slot === "baseColorTexture"));
}

/**
 * Largest side of the images a base color uses
 */
export function getMaxDiffuseSize(report: Pick<InspectReport, "images">): number {
  let imageSize = 0;
  for (const { width, height } of listDiffuseImages(report)) {
    imageSize = Math.max(imageSize, width ?? 0, height ?? 0);
  }
  return imageSize;
}
