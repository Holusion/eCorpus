import { debuglog } from "node:util";
import { HTTPError, NotFoundError } from "../utils/errors.js";
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
   */
  public async setTaskStatus(id: number, status:Omit<TaskStatus, "success"|"error">): Promise<void>{
    debug_status("Set task %d to status %s", id, status);
    await this.db.run(`UPDATE tasks SET status = $2 WHERE task_id = $1`, [id, status]);
  }

  /**
   * Marks a task as completed
   * Output is serialized using `JSON.stringify()`
   */
  async releaseTask(id: number, output: any = null){
    if(debug_logs.enabled) debug_logs(`Release task #${id}`, output);
    else debug_status(`Release task #${id}`);
    await this.db.run(`UPDATE tasks SET status = 'success', output = $2 WHERE task_id = $1`, [id, JSON.stringify(output)]);
  }

  /**
   * @fixme use task.output to store the error message?
   */
  async errorTask(id: number, reason: HTTPError|Error|string){
    try{
      debug_status(`Task #${id} Error : `, reason);
      await this.db.run(`UPDATE tasks SET status = 'error', output = $2 WHERE task_id = $1`, [id, serializeTaskError(reason)]);
    }catch(e:any){
        console.error("While trying to set task status:", e);
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
    let task = await this.db.get<TaskDefinition<T>>(`
      INSERT INTO tasks(fk_scene_id, type, data, status, fk_user_id, parent)
      VALUES ($1, $2, $3, $4, $5, $6) 
      RETURNING ${TaskManager.#taskColumns}
    `, args);
    return task;
  }

  public async getTask<TData extends TaskDataPayload, TReturn = any>(id: number):Promise<TaskDefinition<TData, TReturn>>{
    let task = await this.db.get<TaskDefinition<TData, TReturn>>(`
      SELECT
        ${TaskManager.#taskColumns}
      FROM tasks
      WHERE task_id = $1
    `, [id]);
    if(!task) throw new NotFoundError(`No task found with id ${id}`);
    return task;
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