
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
 * residual gaps (older browsers, sibling-subdomain attackers).
 *
 * Fetch Metadata (`Sec-Fetch-Site`) is the primary signal: the browser sets it
 * and web content can neither forge nor strip it, so it is trusted outright.
 * Only `same-origin` (including form-navigation POSTs) and `none` (the user
 * navigating directly) are legitimate; `same-site` and `cross-site` are not.
 *
 * The `Origin` comparison is only a fallback for the rare client that sends no
 * Fetch Metadata; it is deliberately skipped when `Sec-Fetch-Site` is present.
 * A strict `Referrer-Policy` makes browsers send `Origin: null` on form
 * navigations, and behind a reverse proxy the request's reconstructed host may
 * not equal the public origin — either would wrongly reject a genuine
 * same-origin request if the Origin check were applied unconditionally.
 */
export default function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  if (getAuthMethod(res) !== "session") return next();

  const fetchSite = req.get("Sec-Fetch-Site");
  if (fetchSite) {
    if (fetchSite === "same-origin" || fetchSite === "none") return next();
    return next(new ForbiddenError(`Cross-origin request rejected`));
  }

  //No Fetch Metadata (older or non-browser client): fall back to an Origin check.
  const origin = req.get("Origin");
  if (origin && origin !== getHost(req).origin) {
    return next(new ForbiddenError(`Cross-origin request rejected`));
  }
  next();
}
