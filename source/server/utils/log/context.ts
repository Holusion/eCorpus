import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";

/**
 * Per-request logging context, propagated through the async call tree via
 * {@link AsyncLocalStorage}. Anything stored here is available — without having
 * to thread it through function arguments — to any code that runs as a
 * (possibly asynchronous) descendant of the request handler, most notably the
 * logger's {@link https://getpino.io/#/docs/api?id=mixin mixin}.
 *
 * For now this only carries the opaque request id minted by the reverse proxy.
 * It is intentionally open for extension (authenticated user, real trace ids
 * once we adopt OpenTelemetry, …) as we generalize structured logging.
 */
export interface LogContext {
  /**
   * Opaque per-request id. Set by the reverse proxy (Caddy) and echoed in its
   * access log, so application logs join the proxy access log on this value.
   */
  request_id?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** @returns the current request's {@link LogContext}, or `undefined` outside a request. */
export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}

/** Runs `fn` with `ctx` installed as the active {@link LogContext}. */
export function runWithLogContext<T>(ctx: LogContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Header carrying the proxy-supplied opaque request id (matched case-insensitively). */
export const requestIdHeader = "x-request-id";

/** Defensive upper bound on an externally-supplied id. */
const maxRequestIdLength = 200;

/**
 * Normalizes an inbound request-id header into a usable id.
 *
 * The value is opaque — we only trim and length-cap it. When the proxy didn't
 * provide one (e.g. direct hits in development) we mint a UUID so every request
 * is still correlatable. pino JSON-encodes the value, so embedded control
 * characters cannot break the log line.
 */
export function normalizeRequestId(header: string | undefined): string {
  const id = header?.trim();
  if (id && id.length <= maxRequestIdLength) return id;
  return randomUUID();
}

/**
 * Express middleware that captures the proxy's request id and runs the
 * remainder of the request inside a {@link LogContext}. Mount it first so every
 * downstream handler — including the error handler — inherits the id.
 */
export function logContextMdw(): RequestHandler {
  return function logContext(req, _res, next) {
    runWithLogContext({ request_id: normalizeRequestId(req.get(requestIdHeader)) }, next);
  };
}
