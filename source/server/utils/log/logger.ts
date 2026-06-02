import pino, { type Logger, type LoggerOptions } from "pino";

import staticConfig from "../config.js";
import { getLogContext } from "./context.js";

/**
 * Decide whether to emit machine-readable JSON or human-friendly pretty output.
 *
 * - `LOG_FORMAT=json` → JSON, one object per line (what we forward via fluentd)
 * - anything else     → human-readable `pino-pretty` (the default)
 *
 * JSON is strictly opt-in: a plain `node index.js` — including a production
 * smoke-test run from a terminal — always produces readable output and never
 * depends on the runtime environment. `pino-pretty` is a regular dependency so
 * this branch can never fail to resolve.
 */
function useJSON(): boolean {
  return staticConfig.log_format.toLowerCase() === "json";
}

/**
 * Builds the base {@link LoggerOptions} shared by every logger.
 *
 * Exported so tests can instantiate a logger against a custom stream and assert
 * on the emitted records.
 *
 * Base fields attached to every line:
 * - `time`        ISO-8601 timestamp (added by pino).
 * - `level`       severity label (`info`, `error`, …) rather than pino's numeric default.
 * - `service`     constant service name, to disambiguate sources in a shared backend.
 * - `build_ref`   the running build/release, to correlate logs with a deployment.
 * - `pid`         process id, useful when several workers share a log stream.
 * - `module`      logical source, attached per-logger via {@link createLogger}.
 * - `request_id`  injected per-line from the active request {@link getLogContext context},
 *                 so the proxy access log and application logs join on it.
 * - `err`         structured Error (message + stack) via pino's standard serializer.
 */
export function buildLoggerOptions(): LoggerOptions {
  return {
    level: staticConfig.log_level,
    base: {
      service: "ecorpus",
      build_ref: staticConfig.build_ref,
      pid: process.pid,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      // emit `"level":"error"` instead of `"level":30`
      level: (label) => ({ level: label }),
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
    // Merge the active request context into every line. Returns {} outside a
    // request, so non-HTTP logs (startup, background tasks) simply omit the keys.
    mixin() {
      const request_id = getLogContext()?.request_id;
      return request_id ? { request_id } : {};
    },
  };
}

async function buildRootLogger(): Promise<Logger> {
  const options = buildLoggerOptions();
  if (useJSON()) return pino(options);
  // Imported lazily so JSON deployments don't pay for it, but `pino-pretty` is
  // a regular dependency, so this always resolves.
  const { default: pretty } = await import("pino-pretty");
  return pino(options, pretty({
    colorize: process.stdout.isTTY,
    // Keep human-readable output terse: drop the timestamp, operational
    // constants and the structured-only correlation/access fields (all still
    // present in JSON). `module` moves into the message prefix below, the
    // access details are already summarised in the message string.
    ignore: "time,pid,service,build_ref,request_id,module,method,url,status,length,duration_ms",
    // Prefix the message with its module, e.g. "[http:access] GET / 200".
    messageFormat: (logObj, messageKey) => {
      const msg = logObj[messageKey] ?? "";
      const module = logObj["module"];
      return module ? `[${module}] ${msg}` : `${msg}`;
    },
  }));
}

/** Process-wide root logger. */
export const rootLogger: Logger = await buildRootLogger();

/**
 * Returns a child logger tagged with a `module` field — our "call site"
 * indicator. Prefer one module logger per file, named after its area
 * (e.g. `"http"`, `"vfs/db"`), mirroring the existing `debuglog` namespaces.
 */
export function createLogger(module: string): Logger {
  return rootLogger.child({ module });
}
