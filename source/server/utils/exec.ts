import * as child_process from "child_process";
import { createInterface } from "readline";
import { ITaskLogger, LogSeverity } from "../tasks/types.js";


export interface OutputLine {
  /** Which stream the line was read from */
  fd: "stdout" | "stderr";
  /** Line content, without its trailing line break */
  line: string;
}

export interface SpawnOptions extends child_process.SpawnOptionsWithoutStdio {
  /**
   * Maximum number of lines buffered while the consumer is busy.
   * Child's output streams will be paused beyond this, which in turn blocks the child on write.
   * @default 1000
   */
  highWaterMark?: number;
}

/**
 * Error thrown when a command exits with a non-zero code or is killed by a signal
 */
export class ExecError extends Error {
  constructor(
    public readonly cmd: string,
    public readonly code: number | null,
    public readonly signal: NodeJS.Signals | null,
  ) {
    super(typeof code === "number"
      ? `Command ${cmd} exited with non-zero error code: ${code}`
      : `Command ${cmd} was interrupted by signal ${signal}`
    );
    this.name = "ExecError";
  }
}


/**
 * A message of a command run with `--log-format json`, as meshtinker and mesh2gltf write them on stderr:
 * one JSON object per line. Their levels are the task logger's, so a record can be passed on as is.
 */
export interface LogRecord {
  level: LogSeverity;
  /** The message alone, without the program's name, the severity or the code */
  message: string;
  /** Stable code of a diagnostic or a failure, that callers can map to a localized message */
  code?: string;
  /** Fields that may come later, such as mesh2gltf's `progress` and `stage` */
  [field: string]: unknown;
}

const logLevels: ReadonlySet<string> = new Set<LogSeverity>(["trace", "debug", "info", "warn", "error", "fatal"]);

/**
 * Read one stderr line of a command run with `--log-format json`.
 * Not every line is JSON: a wrapper's own errors, a crash or a library writing to stderr are text.
 * Such a line, or a record with a level we don't know, gets the `fallback` level.
 */
export function parseLogLine(line: string, fallback: LogSeverity = "warn"): LogRecord {
  if (line.startsWith("{")) {
    try {
      const record = JSON.parse(line);
      if (record && typeof record === "object" && typeof record.message === "string") {
        return { ...record, level: logLevels.has(record.level) ? record.level : fallback };
      }
    } catch {
      //Not JSON: a plain message
    }
  }
  return { level: fallback, message: line };
}


/**
 * Spawns a command and yields its output **line by line, as it arrives**.
 * stdout and stderr lines are interleaved in the order they were received.
 *
 * Resolves (ends the iteration) when the process exits with code 0 and all its output has been consumed.
 * Throws an {@link ExecError} if the process exits with a non-zero code or is killed by a signal.
 * Throws the spawn error if the process could not be started (eg. `ENOENT`) or if `opts.signal` was aborted.
 *
 * If the consumer stops iterating early (`break`, `return` or a thrown error),
 * the child process is killed.
 *
 * @example
 * for await (const {fd, line} of run("ktx", ["--version"])){
 *   console.log(`[${fd}] ${line}`);
 * }
 */
export async function* run(cmd: string, args: string[], { highWaterMark = 1000, ...opts }: SpawnOptions = {}): AsyncGenerator<OutputLine, void, undefined> {
  const child = child_process.spawn(cmd, args, opts);

  const queue: OutputLine[] = [];
  let error: Error | null = null;
  let closed = false;
  // Wakes up the generator when something happens
  let notify: (() => void) | null = null;
  const wake = () => {
    const n = notify;
    notify = null;
    n?.();
  };

  // Readline interfaces throw (since node 24) if paused/resumed after they are closed
  // so we keep track of their state explicitly
  const readers = (["stdout", "stderr"] as const).map(fd => {
    const reader = {
      rl: createInterface({ input: child[fd], crlfDelay: Infinity }),
      paused: false,
      closed: false,
    };
    reader.rl.on("line", (line) => {
      queue.push({ fd, line });
      if (highWaterMark <= queue.length && !reader.paused && !reader.closed) {
        reader.paused = true;
        reader.rl.pause();
      }
      wake();
    });
    reader.rl.on("close", () => reader.closed = true);
    return reader;
  });

  child.on("error", (e) => {
    // A failed spawn won't necessarily emit "close"
    error ??= e;
    wake();
  });
  // "close" is emitted after the stdio streams have ended, so all lines have been queued by then.
  child.on("close", (code, signal) => {
    closed = true;
    if (!error && code !== 0) error = new ExecError(cmd, code, signal);
    wake();
  });

  try {
    while (true) {
      if (queue.length) {
        const item = queue.shift()!;
        if (queue.length < highWaterMark / 2) {
          for (const reader of readers) {
            if (!reader.paused || reader.closed) continue;
            reader.paused = false;
            reader.rl.resume();
          }
        }
        yield item;
      } else if (error) {
        throw error;
      } else if (closed) {
        return;
      } else {
        await new Promise<void>(resolve => notify = resolve);
      }
    }
  } finally {
    for (const reader of readers) {
      if (!reader.closed) reader.rl.close();
    }
    if (child.exitCode === null && child.signalCode === null) {
      // Consumer stopped early, or spawn failed after the process was created
      child.kill();
    }
  }
}


/**
 * Run a command with a {@link ITaskLogger} instrumentation
 * stdout will be piped to `logger.debug` and stderr to `logger.warn`, line by line.
 * The promise will then be rejected only if exit code != 0
 */
export async function taskRun(cmd: string, args: string[], { logger, ...opts }: RunCommandOpts): Promise<void> {
  for await (const { fd, line } of run(cmd, args, opts)) {
    if (fd === "stdout") logger.debug(line);
    else logger.warn(line);
  }
}

export interface RunCommandOpts extends SpawnOptions {
  logger: ITaskLogger;
}
