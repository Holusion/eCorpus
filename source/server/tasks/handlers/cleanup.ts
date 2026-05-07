import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import timers from "node:timers/promises";
import { randomInt } from "node:crypto";

import { TaskHandler, TaskHandlerParams } from "../types.js";


/**
 * Deletes terminal tasks (`success` / `error`) whose `ctime` is older than the
 * configured retention thresholds. Only root tasks (`parent IS NULL`) are
 * targeted directly; child rows are removed by `ON DELETE CASCADE`.
 *
 * A retention value of `0` disables that branch.
 */
export async function cleanOldTasks({ context: { db, config, logger } }: TaskHandlerParams<{}>): Promise<{ success: number; error: number }>{
  const retainDays = config.get("task_retention_days");
  const retainErrorDays = config.get("task_errors_retention_days");

  let success = 0;
  let error = 0;

  if (retainDays > 0) {
    const r = await db.run(`
      DELETE FROM tasks
       WHERE parent IS NULL
         AND status = 'success'
         AND ctime < (now() - ($1::int || ' days')::interval)
    `, [retainDays]);
    success = r.changes ?? 0;
    logger.log(`Removed ${success} successful task${success === 1 ? "" : "s"} older than ${retainDays} day${retainDays === 1 ? "" : "s"}`);
  } else {
    logger.log(`task_retention_days is 0; skipping cleanup of successful tasks`);
  }

  if (retainErrorDays > 0) {
    const r = await db.run(`
      DELETE FROM tasks
       WHERE parent IS NULL
         AND status = 'error'
         AND ctime < (now() - ($1::int || ' days')::interval)
    `, [retainErrorDays]);
    error = r.changes ?? 0;
    logger.log(`Removed ${error} errored task${error === 1 ? "" : "s"} older than ${retainErrorDays} day${retainErrorDays === 1 ? "" : "s"}`);
  } else {
    logger.log(`task_errors_retention_days is 0; skipping cleanup of errored tasks`);
  }

  return { success, error };
}


/**
 * Removes blob files in `objectsDir` that are no longer referenced by any row
 * in `files`. A small randomised delay between iterations spreads the I/O.
 *
 * @warning race condition: an object can become unreferenced during the scan
 * and re-referenced before the delete. This is unlikely in practice because
 * unref only happens via scene deletion (not archival).
 */
export async function cleanLooseObjects({ context: { vfs, db, logger } }: TaskHandlerParams<{}>): Promise<string|undefined> {
  // Pre-load every referenced hash once so we don't issue a query per disk object
  const referenced = new Set<string>();
  for await (const row of db.each<{hash: string}>(`SELECT DISTINCT hash FROM files WHERE hash IS NOT NULL`)) {
    referenced.add(row.hash);
  }

  const it = await fs.opendir(vfs.objectsDir);
  const loose: string[] = [];
  for await (const object of it) {
    await timers.setTimeout(randomInt(1));

    if (!referenced.has(object.name)) {
      // ensure file is old enough to avoid racing in-flight writes
      const stat = await fs.stat(vfs.filepath({ hash: object.name }));
      if (stat.mtime.valueOf() < Date.now() - 3600) {
        loose.push(object.name);
      }
    }
  }
  for (const object of loose) {
    fs.unlink(vfs.filepath(object));
  }
  if (!loose.length) return;
  const message = `Cleaned ${loose.length} loose object${1 < loose.length ? "s" : ""}`;
  logger.log(message);
  return message;
}

/**
 * Reports any blob hashes referenced by `files` that are missing on disk.
 * Returns `undefined` when everything checks out.
 */
export async function checkForMissingObjects({ context: { vfs, db, logger } }: TaskHandlerParams<{}>): Promise<string|undefined> {
  const missing: string[] = [];
  for await (const object of db.each<{hash: string}>(`SELECT DISTINCT hash AS hash FROM files WHERE data IS NULL`)) {
    if (object.hash === "directory" || object.hash === null) continue;
    try {
      await fs.access(vfs.filepath(object), constants.R_OK);
    } catch {
      missing.push(object.hash);
    }
    await timers.setTimeout(1);
  }
  if (!missing.length) return;
  const message = missing.length < 3
    ? `File${1 < missing.length ? "s" : ""} ${missing.join(", ")} can't be read on disk (can't fix). Some data have been lost!`
    : `found ${missing.length} missing objects (can't fix). Some data may have been lost!`;
  logger.error(message);
  return message;
}

/**
 * Removes artifact directories for tasks that no longer exist in the database.
 */
export async function cleanTaskArtifacts({ context: { vfs, db, logger } }: TaskHandlerParams<{}>): Promise<string|undefined> {
  let it;
  try {
    it = await fs.opendir(vfs.artifactsDir);
  } catch (e: any) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  const stale: string[] = [];
  for await (const entry of it) {
    await timers.setTimeout(randomInt(1));
    const taskId = parseInt(entry.name, 10);
    if (isNaN(taskId)) continue;
    const rows = await db.all(`SELECT task_id FROM tasks WHERE task_id = $1`, [taskId]);
    if (!rows || rows.length === 0) {
      stale.push(path.join(vfs.artifactsDir, entry.name));
    }
  }
  for (const dir of stale) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  if (!stale.length) return;
  const message = `Cleaned ${stale.length} stale artifact director${1 < stale.length ? "ies" : "y"}`;
  logger.log(message);
  return message;
}


/**
 * Database optimization placeholder. Autovacuum is enabled at the cluster
 * level (see `postgresql.conf`) and the autovacuum daemon issues `ANALYZE`
 * automatically when table data has changed significantly, so there is no
 * scheduled work to do here. This task exists to keep an explicit hook for
 * future, on-demand tuning (e.g. ad-hoc `REINDEX`).
 */
export async function optimize({ context: { logger } }: TaskHandlerParams<{}>): Promise<string> {
  const message = "Database optimization deferred to autovacuum";
  logger.log(message);
  return message;
}


/**
 * Orchestrates routine maintenance: runs each cleanup phase as its own child
 * task so failures are isolated and individually visible in the tasks UI.
 *
 * Invoked both at startup (once) and on a recurring 24h interval; the
 * optional `trigger` parameter is used purely for log clarity.
 */
export interface RunCleanupParams {
  trigger?: "startup" | "scheduled";
}

export async function runCleanup({ task: { data: { trigger = "scheduled" } }, context: { tasks, logger } }: TaskHandlerParams<RunCleanupParams>): Promise<void> {
  logger.log(`Running cleanup (trigger=${trigger})`);
  const phases: Array<TaskHandler<{}>> = [cleanLooseObjects, checkForMissingObjects, cleanTaskArtifacts, cleanOldTasks, optimize];
  for (const handler of phases) {
    try {
      await tasks.run({ handler, data: {} });
    } catch (e: any) {
      logger.error(`Phase ${handler.name} failed: ${e?.message ?? e}`);
    }
  }
}
