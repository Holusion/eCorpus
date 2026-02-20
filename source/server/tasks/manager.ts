import { debuglog } from "node:util";
import { BadRequestError, HTTPError, NotFoundError } from "../utils/errors.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { serializeTaskError } from "./errors.js";
import { TaskStatus, TaskDataPayload, TaskDefinition, CreateTaskParams, TaskNode, TaskLogEntry, TaskTreeResult, LogSeverity } from "./types.js";

const debug_status = debuglog("tasks:status");
const debug_logs = debuglog("tasks:logs");

/**
 * Contains base interface to manage tasks: creation, status changes, etc...
 * To be used through a {@link TaskScheduler} or directly for externally-managed tasks
 */
export class TaskManager{
  public get db(){
    if(!this._db) throw new Error(`TaskManager has been closed`);
    return this._db;
  }

  constructor(private _db: DatabaseHandle){
    if(!this._db) throw new Error("A valid database handle is required to instanciate a TaskManager");
  }
  

  close(){
    this._db = null as any;
  }
   /**
   * Internal method to adjust task status
   * @param id 
   * @param status 
   * @warning it's almost always better to use the narrowed-down versions :
   * {@link TaskManager.takeTask}, {@link TaskManager.releaseTask} and {@link TaskManager.errorTask}
   * Because they contain more robust assertions about the task's current sate that might prevent a number of race conditions
   * eg. {@link TaskManager.takeTask} will only work on tasks that have not already started
   */
  public async setTaskStatus(id: number, status:Omit<TaskStatus, "success"|"error">): Promise<void>{
    debug_status("Set task %d to status %s", id, status);
    let r = await this.db.run(`UPDATE tasks SET status = $2 WHERE task_id = $1`, [id, status]);
    if(!r.changes) throw new NotFoundError(`No task found with id ${id}`);
  }

  /**
   * "take" a task that has status "pending" or "initializing" and switch it to status "running"
   * @param id 
   * @throws {NotFoundError} if task doesn't exist
   * @throws {BadRequestError} if task status doesn't match 'pending' or 'initializing'
   */
  public async takeTask(id: number): Promise<void>{
    debug_status("Take task %d", id);
    const r = await this.db.run(`UPDATE tasks SET status = 'running' WHERE task_id = $1 AND status IN ('initializing', 'pending')`, [id]);
    if(!r.changes){
      const t = await this.getTask(id); //will throw NotFoundError if task doesn't exist
      throw new BadRequestError(`Can't take task #${id} with status ${t.status}`);
    }
  }

  /**
   * Marks a task as completed
   * Output is serialized using `JSON.stringify()`
   * @throws {NotFoundError} if task doesn't exist
   */
  async releaseTask(id: number, output: any = null){
    if(debug_logs.enabled) debug_logs(`Release task #${id}`, output);
    else debug_status(`Release task #${id}`);
    
    const result = await this.db.run(`UPDATE tasks SET status = 'success', output = $2 WHERE task_id = $1`, [id, JSON.stringify(output)]);
    if(!result.changes){
      throw new NotFoundError(`No task found with id ${id}`);
    }
  }

  /**
   * Marks a task as failed with an error message
   * @throws {NotFoundError} if task doesn't exist
   * @throws {Error} if error serialization or database update fails
   */
  async errorTask(id: number, reason: HTTPError|Error|string){
    try{
      debug_status(`Task #${id} Error : `, reason);
      const serialized = serializeTaskError(reason)
      const result = await this.db.run(`UPDATE tasks SET status = 'error', output = $2 WHERE task_id = $1`, [id, serialized]);
      
      if(!result.changes){
        throw new NotFoundError(`No task found with id ${id}`);
      }
    }catch(e:any){
      console.error("While trying to set task status:", e);
      throw e;
    }
  }

  static #taskColumns = `
    fk_scene_id AS scene_id,
    fk_user_id AS user_id,
    task_id,
    ctime,
    type,
    parent,
    data,
    output,
    status
   `;

  // Same as #taskColumns but with every column qualified by the tasks table alias,
  // needed inside recursive CTEs where tasks is joined against a CTE that also
  // exposes task_id (causing an "ambiguous column" error in PostgreSQL).
  static #qualifiedTaskColumns = `
    tasks.fk_scene_id AS scene_id,
    tasks.fk_user_id AS user_id,
    tasks.task_id,
    tasks.ctime,
    tasks.type,
    tasks.parent,
    tasks.data,
    tasks.output,
    tasks.status
   `;

  public async create<T extends TaskDataPayload = any>({scene_id, user_id, type, data, status='pending', parent=null}: CreateTaskParams<T>): Promise<TaskDefinition<T>>{
    let args =  [scene_id, type, data ?? {}, status, user_id, parent];
    let task = await this.db.all<TaskDefinition<T>>(`
      INSERT INTO tasks(fk_scene_id, type, data, status, fk_user_id, parent)
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING ${TaskManager.#taskColumns}
    `, args);
    return task[0];
  }

  public async getTask<TData extends TaskDataPayload, TReturn = any>(id: number):Promise<TaskDefinition<TData, TReturn>>{
    let task = await this.db.all<TaskDefinition<TData, TReturn>>(`
      SELECT
        ${TaskManager.#taskColumns}
      FROM tasks
      WHERE task_id = $1
      LIMIT 1
    `, [id]);
    if(!task.length) throw new NotFoundError(`No task found with id ${id}`);
    return task[0];
  }

  /**
   * Returns all log lines for a single task, ordered by `log_id ASC`.
   * @throws {NotFoundError} if no task with `id` exists
   */
  public async getLogs(id: number): Promise<TaskLogEntry[]> {
    // Verify task existence first so callers get a proper NotFoundError
    await this.getTask(id);
    return this.db.all<TaskLogEntry>(`
      SELECT
        log_id,
        fk_task_id AS task_id,
        timestamp,
        severity,
        message
      FROM tasks_logs
      WHERE fk_task_id = $1
      ORDER BY log_id ASC
    `, [id]);
  }

  /**
   * Fetches a task by id together with **all descendants** (tasks whose `parent`
   * chain leads back to `id`), and every log line produced by any of those tasks.
   *
   * The query is issued as a **single atomic statement** using a recursive CTE so
   * the result is a consistent snapshot even under concurrent writes.
   *
   * Returned structure:
   * - `root` – the requested {@link TaskNode} with descendants nested under `children`.
   * - `logs` – flat array of {@link TaskLogEntry} ordered by `log_id ASC`,
   *   optionally filtered to lines at or above `options.level`.
   *
   * @param options.level  Minimum severity to include. Defaults to `'debug'` (all lines).
   *                       Severity order: `debug` < `log` < `warn` < `error`.
   * @throws {NotFoundError} when no task with `id` exists
   */
  public async getTaskTree<TData extends TaskDataPayload = any, TReturn = any>(
    id: number,
    options?: { level?: LogSeverity }
  ): Promise<TaskTreeResult<TData, TReturn>> {
    /*
     * One atomic query:
     *   1. Recursive CTE `tree` walks the task graph depth-first.
     *   2. Left-join with tasks_logs to pull every log line in the same pass,
     *      filtered by minimum severity using PostgreSQL's ENUM ordering.
     *   3. The outer SELECT returns every (task, log?) pair; rows with no
     *      matching logs still appear once thanks to LEFT JOIN.
     *
     * Post-processing in JS is O(n) and avoids a second round-trip.
     */
    const level: LogSeverity = options?.level ?? 'debug';
    const rows = await this.db.all<{
      // task columns
      scene_id: number;
      user_id: number;
      task_id: number;
      ctime: Date;
      type: string;
      parent: number | null;
      data: TData extends undefined ? {} : TData;
      output: TReturn;
      status: string;
      // log columns (nullable – task may have no logs)
      log_id: number | null;
      log_task_id: number | null;
      timestamp: Date | null;
      severity: string | null;
      message: string | null;
    }>(`
      WITH RECURSIVE tree AS (
        SELECT ${TaskManager.#taskColumns}
        FROM tasks
        WHERE task_id = $1

        UNION ALL

        SELECT ${TaskManager.#qualifiedTaskColumns}
        FROM tasks
        INNER JOIN tree ON tasks.parent = tree.task_id
      )
      SELECT
        tree.*,
        tl.log_id,
        tl.fk_task_id  AS log_task_id,
        tl.timestamp,
        tl.severity,
        tl.message
      FROM tree
      LEFT JOIN tasks_logs tl ON tl.fk_task_id = tree.task_id
                              AND tl.severity >= $2::log_severity
      ORDER BY tl.log_id ASC NULLS FIRST
    `, [id, level]);

    if (!rows.length) {
      throw new NotFoundError(`No task found with id ${id}`);
    }

    // --- assemble tasks (deduplicate by task_id) and logs (deduplicate by log_id) ---
    const taskMap = new Map<number, TaskNode<TData, TReturn>>();
    const logs: TaskLogEntry[] = [];
    const seenLogIds = new Set<number>();

    for (const row of rows) {
      if (!taskMap.has(row.task_id)) {
        taskMap.set(row.task_id, {
          scene_id: row.scene_id,
          user_id: row.user_id,
          task_id: row.task_id,
          ctime: row.ctime,
          type: row.type,
          parent: row.parent,
          after: [],
          data: row.data,
          output: row.output,
          status: row.status as any,
          children: [],
        });
      }

      if (row.log_id !== null && !seenLogIds.has(row.log_id)) {
        seenLogIds.add(row.log_id);
        logs.push({
          log_id: row.log_id,
          task_id: row.log_task_id!,
          timestamp: row.timestamp!,
          severity: row.severity as any,
          message: row.message!,
        });
      }
    }

    // Wire up children and find the root (the node whose parent is not in the tree)
    let root: TaskNode<TData, TReturn> | undefined;
    for (const node of taskMap.values()) {
      if (node.parent !== null && taskMap.has(node.parent)) {
        taskMap.get(node.parent)!.children.push(node);
      } else {
        root = node;
      }
    }

    return { root: root!, logs };
  }

  /**
   * Deletes a task from the database
   * Deletion will cascade to any dependents.
   */
  async deleteTask(id: number): Promise<boolean>{
    let r = await this.db.run(`DELETE FROM tasks WHERE task_id = $1`, [id]);
    if(r.changes !== 1) return false;
    return true; 
  }
  
}