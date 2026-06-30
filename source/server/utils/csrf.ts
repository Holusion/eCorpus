
import { NextFunction, Request, Response } from "express";

import { ForbiddenError } from "./errors.js";
import { getAuthMethod, getHost } from "./locals.js";

/**
 * Safe (read-only) methods, exempt from CSRF checks. Everything else — every
 * state-changing verb, including any WebDAV method the scenes routes may grow
 * (MKCOL/MOVE/COPY/PROPPATCH, …) — is treated as unsafe and checked, so a new
 * method is covered by default instead of silently slipping past an allowlist.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
/**
 * Decide whether an unsafe request looks cross-origin, using Fetch Metadata
 * first and an Origin/host comparison as the fallback. See the rationale on
 * {@link csrfProtection}.
 */
function isCrossOrigin(req: Request): boolean {
  const fetchSite = req.get("Sec-Fetch-Site");
  if (fetchSite) {
    //The browser sets it and web content can neither forge nor strip it.
    return fetchSite !== "same-origin" && fetchSite !== "none";
  }
  //No Fetch Metadata (older or non-browser client): fall back to an Origin check.
  const origin = req.get("Origin");
  return !!origin && origin !== getHost(req).origin;
}

export default function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (getAuthMethod(res) !== "session") return next();
  if (isCrossOrigin(req)) return next(new ForbiddenError(`Cross-origin request rejected`));
  next();
}

/**
 * CSRF protection for the anonymous endpoints that *establish* a session
 * (login, magic-link submission). {@link csrfProtection} exempts anonymous
 * requests because they carry no ambient authority to abuse — but a forged
 * cross-site POST here logs the victim into the *attacker's* account (login
 * CSRF / session fixation), so the credential they keep using is the
 * attacker's. This variant runs the same same-origin check without the
 * auth-method exemption.
 *
 * Non-browser clients still pass: with no Fetch Metadata and no Origin header
 * there is nothing to reject, so scripted logins keep working.
 */
export function csrfProtectAnonymous(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (isCrossOrigin(req)) return next(new ForbiddenError(`Cross-origin request rejected`));
  next();
}
