
import { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "./errors.js";
import { getAuthMethod, getHost } from "./locals.js";

/**
 * Methods that may change state. Includes the WebDAV methods served by the
 * scenes routes.
 */
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE", "MKCOL", "MOVE", "COPY", "PROPPATCH"]);

/**
 * Cross-site request forgery protection for cookie-authenticated requests.
 *
 * Only applies to unsafe methods authenticated by the session cookie
 * (`getAuthMethod(res) === "session"`): Bearer-token requests are
 * CSRF-immune by construction (the header doesn't travel automatically), and
 * anonymous requests have nothing to forge. This keeps non-browser clients —
 * including WebDAV over tokens, which send neither Origin nor Sec-Fetch-Site —
 * working unchanged.
 *
 * Defense complements `sameSite: "lax"` on the cookie itself, covering the
 * residual gaps (older browsers, sibling-subdomain attackers):
 *  - `Sec-Fetch-Site: cross-site` is rejected;
 *  - a present `Origin` header must match the request's own origin
 *    (browsers always send Origin on cross-origin requests, and on
 *    same-origin POSTs; its absence means a non-browser client).
 */
export default function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  if (getAuthMethod(res) !== "session") return next();

  const fetchSite = req.get("Sec-Fetch-Site");
  if (fetchSite === "cross-site") {
    return next(new ForbiddenError(`Cross-site request rejected`));
  }
  const origin = req.get("Origin");
  if (origin && origin !== getHost(req).origin) {
    return next(new ForbiddenError(`Cross-origin request rejected`));
  }
  next();
}
