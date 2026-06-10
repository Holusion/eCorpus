
import { RequestHandler } from "express";

/**
 * Baseline security headers, set on every response.
 *
 * Kept as a small explicit middleware rather than a dependency (helmet):
 * eCorpus' embedding requirements (scene embeds, oembed, /dist served with
 * permissive CORS) force frame and cross-origin-isolation headers off, and
 * what remains is a handful of static strings better declared in one
 * readable place.
 */
export default function securityHeaders({ hsts }: { hsts: boolean }): RequestHandler {
  return function setSecurityHeaders(req, res, next) {
    //Browsers must not sniff content types away from Content-Type
    res.set("X-Content-Type-Options", "nosniff");
    //Don't leak (possibly private) URLs to external sites
    res.set("Referrer-Policy", "no-referrer");
    //Explicitly disable the legacy XSS auditor: it enables side-channels of its own
    res.set("X-XSS-Protection", "0");
    if (hsts) {
      //180 days. Only meaningful behind TLS, hence production-gated
      res.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }
    next();
  };
}
