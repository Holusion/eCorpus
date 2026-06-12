
import { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Report-Only Content-Security-Policy: scene templates use inline scripts and
 * Voyager loads workers/assets from blob:, so an enforced policy needs a
 * dedicated effort. Report-Only surfaces violations in the browser console
 * without breaking anything.
 *
 * `dev` relaxes one directive that is only exercised in development: webpack's
 * `eval-source-map` devtool runs modules through `eval()`, so `'unsafe-eval'`
 * is needed to keep the dev console free of false positives. The production
 * bundle uses external `.map` files and never evals, so production stays
 * strict (no `'unsafe-eval'`).
 */
function buildCspReportOnly({ dev }: { dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    //Fonts are self-hosted (Noto Serif woff2 under /dist/fonts), so no third party.
    "font-src 'self' data:",
    "connect-src 'self' blob: data:",
    "worker-src 'self' blob:",
  ].join("; ");
}

/**
 * Baseline security headers, set on every response.
 *
 * Kept as a small explicit middleware rather than a dependency (helmet):
 * eCorpus' embedding requirements (scene embeds, oembed, /dist served with
 * permissive CORS) force frame and cross-origin-isolation headers off, and
 * what remains is a handful of static strings better declared in one
 * readable place.
 */
export default function securityHeaders({ hsts, dev = false }: { hsts: boolean, dev?: boolean }): RequestHandler {
  const cspReportOnly = buildCspReportOnly({ dev });
  return function setSecurityHeaders(req, res, next) {
    //Browsers must not sniff content types away from Content-Type
    res.set("X-Content-Type-Options", "nosniff");
    //Don't leak (possibly private) URLs to external sites, but keep the full
    //referrer on same-origin requests: the app relies on it (e.g. redirecting
    //a user-creation form POST back to the originating admin page), and a
    //strict `no-referrer` also makes browsers send `Origin: null` on form
    //navigations, which the CSRF origin check would then reject.
    res.set("Referrer-Policy", "same-origin");
    //Explicitly disable the legacy XSS auditor: it enables side-channels of its own
    res.set("X-XSS-Protection", "0");
    res.set("Content-Security-Policy-Report-Only", cspReportOnly);
    if (hsts) {
      //180 days. Only meaningful behind TLS, hence production-gated
      res.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  };
}

/**
 * Forbid framing of pages where a clickjacked interaction grants authority —
 * first and foremost the OAuth consent page, where a hijacked click mints a
 * token (the rest of /auth is denied along with it; none of it is meant to be
 * embedded). Can not be a site-wide default: scene embedding requires
 * frameability.
 * The single-directive Content-Security-Policy enforces only frame-ancestors
 * and coexists with the site-wide Report-Only policy.
 */
export function noFraming(req: Request, res: Response, next: NextFunction) {
  res.set("X-Frame-Options", "DENY");
  res.set("Content-Security-Policy", "frame-ancestors 'none'");
  next();
}
