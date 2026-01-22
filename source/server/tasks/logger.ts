import { Writable } from "node:stream";
import { ITaskLogger, LogSeverity } from "./types.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { format } from "node:util";

/**
 * Disposable logger that queues messages and waits for all logs to be flushed when closed
 */
export function createLogger(db: DatabaseHandle, task_id: number){

  const stream = new Writable({
    objectMode: true,
    write: async ({severity, message}, encoding, callback) => {
      try {
        await db.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, $2, $3)`, [task_id, severity, message]);
        callback();
      } catch (err) {
        callback(err as Error);
      }
    }
  });

  function log(severity: LogSeverity, message: string){
    stream.write({severity, message});
  }

  return {
    debug: (...args:any[])=>log('debug', format(...args)),
    log: (...args:any[])=>log('log', format(...args)),
    warn: (...args:any[])=>log('warn', format(...args)),
    error: (...args:any[])=>log('error', format(...args)),
    [Symbol.asyncDispose]: function (): PromiseLike<void> {
    return new Promise<void>((resolve) => {
      stream.end(() => resolve());
    });
    }
  } satisfies ITaskLogger & AsyncDisposable;
}