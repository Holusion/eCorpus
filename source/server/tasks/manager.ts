import { debuglog } from "node:util";
import { BadRequestError, HTTPError, NotFoundError } from "../utils/errors.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { serializeTaskError } from "./errors.js";
import { TaskStatus, TaskDataPayload, TaskDefinition, CreateTaskParams } from "./types.js";

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
   * Deletes a task from the database
   * Deletion will cascade to any dependents.
   */
  async deleteTask(id: number): Promise<boolean>{
    let r = await this.db.run(`DELETE FROM tasks WHERE task_id = $1`, [id]);
    if(r.changes !== 1) return false;
    return true; 
  }
  
}