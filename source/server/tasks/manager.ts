import { debuglog } from "node:util";
import { HTTPError, NotFoundError } from "../utils/errors.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { serializeTaskError } from "./errors.js";
import { TaskStatus, TaskData, TaskDefinition, CreateTaskParams } from "./types.js";

const debug_outputs = debuglog("tasks:outputs");

/**
 * Contains base interface to manage tasks: creation, status changes, etc...
 * To be used through a {@link TaskScheduler} or directly for externally-managed tasks
 */
export class TaskManager{
  public get db(){
    return this._db;
  }

  constructor(private _db: DatabaseHandle){
    
  }
   /**
   * Internal method to adjust task status
   * @param id 
   * @param status 
   */
  public async setTaskStatus(id: number, status:Omit<TaskStatus, "success"|"error">): Promise<void>{
    await this.db.run(`UPDATE tasks SET status = $2 WHERE task_id = $1`, [id, status]);
  }

  /**
   * Marks a task as completed
   * Output is serialized using `JSON.stringify()`
   */
  async releaseTask(id: number, output: any = null){
    debug_outputs(`Release task #${id}`, output);
    await this.db.run(`UPDATE tasks SET status = 'success', output = $2 WHERE task_id = $1`, [id, JSON.stringify(output)]);
  }

  /**
   * @fixme use task.output to store the error message?
   */
  async errorTask(id: number, reason: HTTPError|Error|string){
    try{
      debug_outputs(`Task #${id} Error : `, reason);
      await this.db.run(`UPDATE tasks SET status = 'error', output = $2 WHERE task_id = $1`, [id, serializeTaskError(reason)]);
    }catch(e:any){
        console.error("While trying to set task status:", e);
    }
  }

  public async create<T extends TaskData = any>({scene_id, user_id, type, data, status='pending'}: CreateTaskParams<T>): Promise<TaskDefinition<T>>{
    let args =  [scene_id, type, data, status, user_id];
    let task = await this.db.get<TaskDefinition<T>>(`
      INSERT INTO tasks(fk_scene_id, type, data, status, fk_user_id)
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `, args);
    return task;
  }

    public async getTask<T extends TaskDefinition>(id: number):Promise<T>{
    let task = await this.db.get<T>(`
      SELECT
        fk_scene_id,
        fk_user_id,
        task_id,
        ctime,
        type,
        parent,
        data,
        output,
        status
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