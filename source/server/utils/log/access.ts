import type { RequestHandler } from "express";

import { createLogger } from "./logger.js";
import { getLogContext, runWithLogContext } from "./context.js";

const log = createLogger("http:access");

/**
 * Express middleware that logs one line per completed request at `trace` level.
 * Because it goes through the application logger it honours the configured log
 * level (LOG_LEVEL) and output format, and the active request id is injected
 * like any other log line.
 *
 * Access logging is meant for development / debugging: in production the
 * reverse proxy is the authoritative access log, so this stays off unless the
 * level is lowered to `trace`. We short-circuit entirely when it is not enabled
 * so finished requests don't even register a listener.
 */
export function accessLogMdw(): RequestHandler {
  return function accessLog(req, res, next) {
    if (!log.isLevelEnabled("trace")) return next();
    const start = process.hrtime.bigint();
    // Captured here, while inside the request context, then re-established when
    // the (asynchronous) "finish" event fires so the logger mixin still sees it.
    const ctx = getLogContext();
    res.on("finish", () => {
      const duration_ms = Number(process.hrtime.bigint() - start) / 1e6;
      const length = res.getHeader("content-length");
      // Summarise everything in the message so pretty output stays a single
      // line; the same values are kept as structured fields for JSON queries.
      const summary = `${req.method} ${req.originalUrl} ${res.statusCode}`
        + (length != null ? ` ${length}b` : "")
        + ` ${duration_ms.toFixed(1)}ms`;
      const emit = () => log.trace({
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        length,
        duration_ms,
      }, summary);
      ctx ? runWithLogContext(ctx, emit) : emit();
    });
    next();
  };
}
