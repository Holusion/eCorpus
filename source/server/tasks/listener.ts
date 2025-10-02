import EventEmitter, { on } from "node:events";
import { Client, Notification } from "pg";
import { DatabaseHandle, toHandle } from "../vfs/helpers/db.js";
import { ResolvedTaskDefinition, TaskData, TaskDefinition, TaskHandler, TaskStatus, TaskType, TaskTypeData } from "./types.js";
import { NotFoundError, InternalError } from "../utils/errors.js";
import { debuglog } from "node:util";

const debug = debuglog("tasks:scheduler");

export interface TaskListenerParams{
  client: Client;
}


export interface CreateTaskParams<T extends TaskType>{
  type: T;
  data: TaskTypeData<T>;
  parent?:number|null;
  after?: number|null;
}

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


  constructor({client}: TaskListenerParams){
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
      if(status === "error"){
        this.db.get<{message:string}>(`SELECT message FROM tasks_logs WHERE fk_task_id = $1 AND severity = 'error' ORDER BY log_id DESC LIMIT 1`, [task_id])
        .then((log)=>{
          if(log) this.emit("error", new Error(`In task ${task_id}: ${log.message}`));
          if(log) this.emit("error", new Error(`In task ${task_id}: no logs`));
        }, (e:any)=>{
          this.emit("error", new Error(`In task ${task_id}: failed to get log with error: ${e.message}`));
        });
      }else{
        this.emit(status, task_id);
      }
    }
  }


  /**
   * Internal method to adjust task status
   * @param id 
   * @param status 
   */
  public async setTaskStatus(id: number, status:TaskStatus){
    await this.db.run(`UPDATE tasks SET status = $2 WHERE task_id = $1`, [id, status]);
  }


  public async resolveTask<T extends TaskType>(id: number):Promise<ResolvedTaskDefinition<TaskTypeData<T>>>{
    let task = await this.db.get<ResolvedTaskDefinition>(`
      SELECT
        fk_scene_id,
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
    return task as any;
  }

  async create<T extends TaskType>(scene: number, {type, data, parent = null, after = null}:CreateTaskParams<T> ): Promise<TaskDefinition>{
    let task = await this.db.get<TaskDefinition>(`
      INSERT INTO tasks(fk_scene_id, type, after, parent, data)
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `, [scene, type, after, parent, data]);

    return task;
  }

  async wait(id: number){
    let it = on(this, "success");
    let task = await this.db.get<{status: TaskStatus}> (`SELECT status FROM tasks WHERE task_id = $1`, [id]);
    if(!task){
      throw new NotFoundError(`No task found with id ${id}`);
    }
    if(task.status === "error"){
      /** @fixme should retrieve task logs to provide a helpful message */
      throw new InternalError("Task failed");
    }else if(task.status === "success"){
      return;
    }
    for await (let [taskId] of it){
      if(taskId === id) return;
    }
  }
}
