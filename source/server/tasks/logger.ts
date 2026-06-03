import { Writable, Transform } from "node:stream";
import { format } from "node:util";
import { ITaskLogger, LogSeverity } from "./types.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { createLogger as createStructuredLogger } from "../utils/log/index.js";

/**
 * Shared structured logger for everything emitted by tasks. Child loggers
 * are created per task so each line carries `task_id`/`scene_id`/`user_id`.
 */
const tasksLog = createStructuredLogger("tasks:logs");

/** Severity passed to {@link ITaskLogger}, including the deprecated `log` alias. */
type LoggerCallSeverity = LogSeverity | "log";

/**
 * Creates a Transform stream that batches logs by count or time
 * @param batchSize max number of writes to batch
 * @param debounceMs max time to wait before flushing writes
 */
export function createBatcher(batchSize: number, debounceMs: number) {
  let buffer: Array<{ severity: LogSeverity; message: string }> = [];
  let timer: NodeJS.Timeout | null = null;

  return new Transform({
    objectMode: true,
    highWaterMark: batchSize,
    transform(chunk, _, cb) {
      buffer.push(chunk);

      // Flush immediately if batch is full
      if (buffer.length >= batchSize) {
        if (timer) clearTimeout(timer);
        timer = null;
        this.push(buffer);
        buffer = [];
      } else if (!timer) {
        // Start timer only if one isn't already running
        timer = setTimeout(() => {
          if (buffer.length) {
            this.push(buffer);
            buffer = [];
          }
          timer = null;
        }, debounceMs);
      }
      cb();
    },
    flush(cb) {
      // Ensure remaining data is sent when the stream ends
      if (timer) clearTimeout(timer);
      if (buffer.length) this.push(buffer);
      cb();
    }
  });
}

/**
 * Create a stream that batch-inserts logs into the database
 * @param db 
 * @param task_id 
 * @returns 
 */
export function createInserter(db: DatabaseHandle, task_id: number) {
  return new Writable({
    objectMode: true,
    write(batch: Array<{ severity: LogSeverity; message: string, timestamp: Date }>, _, cb) {
      const severities: LogSeverity[] = [];
      const messages: string[] = [];
      const timestamps: Date[] = [];
      for (let log of batch) {
        severities.push(log.severity);
        messages.push(log.message);
        timestamps.push(log.timestamp);
      }

      db.run(`
        INSERT INTO tasks_logs(fk_task_id, severity, message) 
        SELECT $1, *
        FROM UNNEST($2::log_severity[], $3::text[]) AS t(severity, message)`,
        [task_id, severities, messages]
      ).then(() => cb(), cb);
    }
  });
}

/** Per-task identification fields forwarded to the structured logger. */
export interface TaskLoggerContext {
  scene_id?: number | null;
  user_id?: number | null;
}

/**
 * Disposable logger that batches log inserts using Transform streams
 * Reduces database lock contention by grouping multiple inserts
 *
 * Every line is also forwarded to the {@link tasksLog `tasks:logs`} structured
 * logger at its original severity, carrying `task_id`/`scene_id`/`user_id` as
 * structured fields so production logs can be filtered/joined by task.
 */
export function createLogger(db: DatabaseHandle, task_id: number, ctx: TaskLoggerContext = {}) {
  const batcher = createBatcher(10, 100);

  const inserter = createInserter(db, task_id);

  batcher.pipe(inserter);
  batcher.on("error", (err) => inserter.destroy(err));

  const fields = { task_id, scene_id: ctx.scene_id ?? undefined, user_id: ctx.user_id ?? undefined };
  const child = tasksLog.child(fields);

  function log(severity: LoggerCallSeverity, message: string) {
    // `logger.log(...)` is the deprecated alias for `info`; both emit at info
    // severity, both persist as `info` in the DB.
    const persistSeverity: LogSeverity = severity === "log" ? "info" : severity;
    child[persistSeverity](message);
    batcher.write({ severity: persistSeverity, message, timestamp: new Date() });
  }

  return {
    trace: (...args: any[]) => log('trace', format(...args)),
    debug: (...args: any[]) => log('debug', format(...args)),
    info:  (...args: any[]) => log('info',  format(...args)),
    log:   (...args: any[]) => log('log',   format(...args)),
    warn:  (...args: any[]) => log('warn',  format(...args)),
    error: (...args: any[]) => log('error', format(...args)),
    fatal: (...args: any[]) => log('fatal', format(...args)),
    [Symbol.asyncDispose]: async function (): Promise<void> {
      // Close both streams and wait for them to finish
      batcher.end(); //We expect batcher.end to be effective immediately and never throw, so we don't wait for it
      await new Promise<void>((resolve, reject) => {
        inserter.on('finish', resolve);
        inserter.on('error', reject);
      });
    }
  } satisfies ITaskLogger & AsyncDisposable;
}