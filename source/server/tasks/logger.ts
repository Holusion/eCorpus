import { Writable, Transform } from "node:stream";
import { ITaskLogger, LogSeverity } from "./types.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { debuglog, format } from "node:util";

const debug = debuglog("tasks:logs");

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

/**
 * Disposable logger that batches log inserts using Transform streams
 * Reduces database lock contention by grouping multiple inserts
 */
export function createLogger(db: DatabaseHandle, task_id: number) {
  const batcher = createBatcher(10, 100);

  const inserter = createInserter(db, task_id);

  batcher.pipe(inserter);

  function log(severity: LogSeverity, message: string) {
    debug(`[${severity.toUpperCase()}] ${message}`);
    batcher.write({ severity, message, timestamp: new Date() });
  }

  return {
    debug: (...args: any[]) => log('debug', format(...args)),
    log: (...args: any[]) => log('log', format(...args)),
    warn: (...args: any[]) => log('warn', format(...args)),
    error: (...args: any[]) => log('error', format(...args)),
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