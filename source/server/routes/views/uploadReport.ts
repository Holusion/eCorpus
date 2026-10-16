import { Request, Response } from "express";
import { BadRequestError } from "../../utils/errors.js";

// Presentation rules belong here, separate from model analysis and browser code.
const recommendations = new Map([
  ["png-images", "modelWarnings.recommend-optimize"],
  ["large-textures", "modelWarnings.recommend-optimize"],
  ["large-combined-diffuse-maps", "modelWarnings.recommend-reexport"],
]);

/** Render only the findings returned for this upload, using the request locale. */
export async function renderUploadReport(req: Request, res: Response) {
  const codes = req.query.warnings === undefined ? [] : [req.query.warnings].flat();
  if (codes.some(code => typeof code !== "string")) {
    throw new BadRequestError("Warnings must be a list of codes");
  }
  const warnings = [...new Set(codes as string[])].map(code => ({
    code,
    key: recommendations.has(code) ? `modelWarnings.${code}` : null,
  }));
  res.render("uploadReport", {
    layout: null,
    warnings,
    recommendations: [...new Set(warnings.map(({ code }) => recommendations.get(code)).filter(Boolean))],
  });
}
