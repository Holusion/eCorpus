import EventEmitter from "node:events";
import { Client, Notification } from "pg";
import { DatabaseHandle, toHandle } from "../vfs/helpers/db.js";
import { TaskProcessorParams } from "./processor.js";
import { ResolvedTaskDefinition, TaskDefinition, TaskStatus } from "./types.js";


export class TaskListener extends EventEmitter{

  #client :Client;
  /** We omit beginTransaction since we are working with just one database client */
  #db :Omit<DatabaseHandle, "beginTransaction">;

  #events?: TaskStatus[];

  get db(){
    return this.#db;
  }
  
  get started(){
    return !!this.#events;
  }


  constructor({client}: TaskProcessorParams){
    super();
    this.#client = client;
    this.#db = toHandle(this.#client);
  }

  async start(events: TaskStatus[]){
    this.#events = events.slice();
    this.#client.on("notification", this.onNotification);
    for(let event of this.#events){
      await this.#client.query(`LISTEN tasks_${event}`);
    }
  }

  async stop(){
    if(!this.started) return;
    this.#client.off("notification", this.onNotification);
    for(let event of this.#events!){
      await this.#client.query(`UNLISTEN tasks_${event}`);
    }
  }


  onNotification = ({channel, payload}:Notification)=>{
    const task_id = parseInt(payload!);
    if(!Number.isInteger(task_id)){
      return console.error("Invalid task ID : "+task_id);
    }
    let [prefix, status ] = channel.split("_");
    if(prefix !== "tasks") return console.error("Invalid task channel name :", channel);
    if(this.#events!.indexOf(status as any) !== -1){
      this.emit(status, task_id);
    }
  }


  async create(scene_id: number, {type, data, parent = null}: {type: TaskDefinition["type"], data: TaskDefinition["data"], parent?:TaskDefinition["parent"]}){
    return await this.db.get<TaskDefinition>(`INSERT INTO tasks(fk_scene_id, type, data, parent) VALUES ($1, $2, $3, $4) RETURNING *`, [scene_id, type, data, parent]);
  }

  /**
   * Internal method to adjust task status
   * @param id 
   * @param status 
   */
  public async setTaskStatus(id: number, status:TaskStatus){
    await this.db.run(`UPDATE tasks SET status = $2 WHERE task_id = $1`, [id, status]);
  }


  public async resolveTask(id: number):Promise<ResolvedTaskDefinition>{
    let task = await this.db.get<ResolvedTaskDefinition>(`
      SELECT
        task_id,
        ctime,
        type,
        CASE WHEN parent IS NOT NULL THEN (
          SELECT row_to_json(parent_task) FROM tasks AS parent_task WHERE parent_task.task_id = tasks.parent
        ) ELSE NULL END as parent,
        data,
        status
      FROM tasks
      WHERE task_id = $1
    `, [id]);
    if(task.parent?.ctime){
      task.parent.ctime = new Date(task.parent.ctime);
    }
    return task;

  }
}