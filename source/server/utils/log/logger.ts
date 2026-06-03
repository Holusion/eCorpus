import { PassThrough, Writable } from "node:stream";

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

/**
 * All log output flows through this internal sink. We forward each `data`
 * chunk to whatever {@link _dest} is currently installed, which lets tests
 * swap the destination at runtime via {@link captureLogs} without rebuilding
 * existing module loggers.
 */
const _sink = new PassThrough();
let _dest: NodeJS.WritableStream;
_sink.on("data", (chunk) => _dest.write(chunk));

async function buildDefaultDest(): Promise<NodeJS.WritableStream> {
  if (useJSON()) return process.stdout;
  // Imported lazily so JSON deployments don't pay for it, but `pino-pretty` is
  // a regular dependency, so this always resolves.
  const { default: pretty } = await import("pino-pretty");
  return pretty({
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
  });
}

_dest = await buildDefaultDest();

/** Process-wide root logger. Writes raw JSON to {@link _sink}. */
export const rootLogger: Logger = pino(buildLoggerOptions(), _sink);

/**
 * Registry of every child logger created via {@link createLogger}, keyed by
 * module name. {@link captureLogs} walks this to temporarily lower per-child
 * levels — pino children snapshot the parent level at creation, so bumping
 * `rootLogger.level` alone wouldn't reach them when the test suite runs at
 * `LOG_LEVEL=silent`.
 */
const _moduleLoggers = new Map<string, Logger>();

/**
 * Returns a child logger tagged with a `module` field — our "call site"
 * indicator. Prefer one module logger per file, named after its area
 * (e.g. `"http"`, `"vfs/db"`), mirroring the existing `debuglog` namespaces.
 */
export function createLogger(module: string): Logger {
  let child = _moduleLoggers.get(module);
  if (!child) {
    child = rootLogger.child({ module });
    _moduleLoggers.set(module, child);
  }
  return child;
}

/**
 * Test helper: capture every structured-log line emitted during the returned
 * scope, parsed back from JSON. Bumps the level on `rootLogger` *and* every
 * already-registered child logger to `trace` so a test suite running with
 * `LOG_LEVEL=silent` still sees output. Call `stop()` to restore the previous
 * destination and levels.
 *
 * ```ts
 * const cap = captureLogs();
 * try {
 *   await someCodePathThatLogs();
 *   expect(cap.records).to.have.length(1);
 *   expect(cap.records[0]).to.include({ level: "error", module: "pg:migration" });
 * } finally {
 *   cap.stop();
 * }
 * ```
 */
export function captureLogs(): { records: any[]; stop: () => void } {
  const records: any[] = [];
  let buf = "";
  const cap = new Writable({
    write(chunk, _enc, cb) {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        try { records.push(JSON.parse(line)); } catch { /* not JSON, drop */ }
      }
      cb();
    },
  });

  const prevDest = _dest;
  _dest = cap;

  // Snapshot every level BEFORE bumping anything: pino's child loggers report
  // their parent's level until they're explicitly overridden, so reading
  // `child.level` after we've bumped the root would falsely record "trace"
  // and stop() would never restore the real previous level.
  const prevRootLevel = rootLogger.level;
  const prevChildLevels = new Map<string, string>();
  for (const [mod, child] of _moduleLoggers) {
    prevChildLevels.set(mod, child.level);
  }

  rootLogger.level = "trace";
  for (const child of _moduleLoggers.values()) {
    child.level = "trace";
  }

  return {
    records,
    stop() {
      _dest = prevDest;
      rootLogger.level = prevRootLevel;
      for (const [mod, lvl] of prevChildLevels) {
        const child = _moduleLoggers.get(mod);
        if (child) child.level = lvl;
      }
    },
  };
}
