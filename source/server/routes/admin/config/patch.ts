import { Request, Response } from "express";
import { getLocals } from "../../../utils/locals.js";
import { BadRequestError, ForbiddenError } from "../../../utils/errors.js";


export default async function handlePatchConfig(req: Request, res: Response) {
  const { config } = getLocals(req);

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestError("Expected a JSON object body");
  }

  for (const [key, entry] of Object.entries(body)) {
    let value: unknown;
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      if (!("value" in (entry as object))) {
        throw new BadRequestError(`Missing "value" for key "${key}"`);
      }
      value = (entry as Record<string, unknown>).value;
    } else {
      value = entry;
    }
    if (config.locked(key as any) === undefined) {
      throw new BadRequestError(`Unknown configuration key "${key}"`);
    }
    if (config.locked(key as any)) {
      throw new ForbiddenError(`Configuration key "${key}" is locked by environment variable`);
    }
    await config.set(key as any, value as any);
  }

  res.status(204).send();
}
