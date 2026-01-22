import { debuglog } from "node:util";
import { HTTPError } from "../utils/errors.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { serializeTaskError } from "./errors.js";
import { TaskStatus, TaskData, TaskDefinition } from "./types.js";

const debug_outputs = debuglog("tasks:outputs");

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

  public async create<T extends TaskData = any>(scene: number|null, user_id : number|null, {type, data, status='pending'}: Pick<TaskDefinition<T>,"type"|"data"|"status">): Promise<TaskDefinition<T>>{
    let args =  [scene, type, data, status, user_id];
    let task = await this.db.get<TaskDefinition<T>>(`
      INSERT INTO tasks(fk_scene_id, type, data, status, fk_user_id)
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `, args);
    return task;
  }
}