import { Request } from "express";


/**
 * Whether the request carries the given preference in its `Prefer` header(s) ([RFC 7240](https://www.rfc-editor.org/rfc/rfc7240)).
 * Preference names are case-insensitive. Values and parameters (`wait=10`, `respond-async; foo`) are ignored.
 *
 * A route that honours a preference should say so with `Preference-Applied`.
 */
export function prefers(req: Request, name: string): boolean{
  const header = req.headers["prefer"];
  if(!header) return false;
  const target = name.toLowerCase();
  return (Array.isArray(header)? header : [header])
  .flatMap(h => h.split(","))
  .some(p => p.split(/[=;]/, 1)[0].trim().toLowerCase() === target);
}
