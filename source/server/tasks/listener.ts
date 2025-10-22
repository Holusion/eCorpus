import EventEmitter, { on } from "node:events";
import { Client, Notification } from "pg";
import { DatabaseHandle, toHandle } from "../vfs/helpers/db.js";
import { CreateTaskParams, GroupCallback, TaskContextHandlers, TaskDefinition, TaskHandler, TaskLogger, TaskStatus, TaskType, TaskTypeData } from "./types.js";
import { NotFoundError, InternalError } from "../utils/errors.js";
import { debuglog } from "node:util";

const debug = debuglog("tasks:scheduler");
const debug_logs = debuglog("tasks:logs");

export interface TaskListenerParams{
  client: Client;
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
    if(this.#events!.indexOf(status as any) === -1) return debug(`Received unwanted notification event : ${status}`);

    debug(`Notification for #${payload}: ${status}`);
    this.emit("update", task_id, status);
  }


  async appendTaskLog(id: number, severity: keyof TaskLogger,  message: string){
    debug_logs(`${id} [${severity}]: ${message}`);
    await this.db.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, $2, $3)`, [id, severity, message]);
  }

  async getTaskLogs(id: number, {offset = 0, limit = 25}:{offset?:number, limit?:number} = {}){
    return await this.db.all(`
      SELECT  log_id, timestamp, severity, message
      FROM tasks_logs
      WHERE fk_task_id = $1
      OFFSET $2
      LIMIT $3
    `, [id, offset, limit]);
  }

  async resolveTaskError(task_id: number) : Promise<Error>{
    try{
      let log = await this.db.get<{message:string}>(`SELECT message FROM tasks_logs WHERE fk_task_id = $1 AND severity = 'error' ORDER BY log_id DESC LIMIT 1`, [task_id])
      if(log) return new Error(`In task ${task_id}: ${log.message}`);
      else return new Error(`In task ${task_id}: no logs`);
    }catch(e: any){
      return new Error(`In task ${task_id}: failed to get log with error: ${e.message}`);
    };
  }

  /**
   * Internal method to adjust task status
   * @param id 
   * @param status 
   */
  public async setTaskStatus(id: number, status:TaskStatus){
    await this.db.run(`UPDATE tasks SET status = $2 WHERE task_id = $1`, [id, status]);
  }


  public async getTask<T extends TaskType =any>(id: number):Promise<TaskDefinition<TaskTypeData<T>>>{
    let task = await this.db.get(`
      SELECT
        fk_scene_id,
        task_id,
        ctime,
        type,
        parent,
        (SELECT array_agg(source)::bigint[] FROM tasks_relations WHERE target = task_id) as after,
        data,
        output,
        status
      FROM tasks
      WHERE task_id = $1
    `, [id]);
    if(!task) throw new NotFoundError(`No task found with id ${id}`);
    return {
      ...task,
      after: (task.after??[]).map((n: any)=>parseInt(n))
    };
  }

  async getTasks(){
    return await this.db.all(`
     SELECT 
        tasks.task_id
      FROM tasks
      WHERE tasks.status = 'pending'
        AND NOT EXISTS (
          SELECT 1
          FROM tasks_relations
            INNER JOIN tasks AS source_tasks ON source = source_tasks.task_id
          WHERE target = tasks.task_id
            AND source_tasks.status != 'success'
        )
    `);
  }

  async create<T extends TaskType>(scene: number, user_id : number|null, {type, data, status='pending'}: Pick<CreateTaskParams<T>, "type"|"data"|"status">): Promise<number>{
    let args =  [scene, type, data, status, user_id];
    let task = await this.db.get<{task_id: number}>(`
      INSERT INTO tasks(fk_scene_id, type, data, status, fk_user_id)
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING *
    `, args);
    return task!.task_id;
  }

  async createChild<T extends TaskType>(parent: number, {type, data, status='pending', after}: Pick<CreateTaskParams<T>, "type"|"data"|"status"|"after">):Promise<number>{
    let args =  [parent, type, data, status];
    if(after?.length) args.push(after as any);
    let task = await this.db.get<{task_id: number}>(`
      WITH task AS (
        INSERT INTO tasks(fk_scene_id, fk_user_id, parent, type, data, status)
        SELECT
         fk_scene_id,
         fk_user_id,
         task_id AS parent,
         $2 AS type,
         $3 AS data,
         $4 AS status
        FROM tasks
        WHERE task_id = $1 
        RETURNING *
      )
      ${after?.length?`INSERT INTO 
        tasks_relations (source, target)
      SELECT 
        source,
        task.task_id
      FROM task, unnest( $5::bigint[] ) as source
      RETURNING target AS task_id
      `: `SELECT task_id FROM task`}
    `, args);
    if(!task) throw new NotFoundError(`Parent task ${parent} not found`);
    return task.task_id;
  }


  async group(parent_id:number, work:GroupCallback) :Promise<number>
  {
    if(typeof work !== "function") throw new Error("Invalid payload : "+ (work as any).toString());
    let group_id = await this.createChild(parent_id, {type: "groupOutputsTask", status: 'initializing', data: {}, after: []});
    
    const ctx = this.makeTaskProxy(group_id);

    for await(let child of await work(ctx)){
      debug(`Add dependency over #${child} for #${group_id}`);
      await this.addRelation(child, group_id);
    }
      debug(`Make group #${group_id} ready for processing`);
    await this.setTaskStatus(group_id, 'pending');

    return group_id;
  }

  async addRelation(source: number, target: number){
    await this.db.run(`INSERT INTO tasks_relations(source, target) VALUES($1, $2)`, [source, target]);
  }

  /**
   * Create a wrapper context around task creation functions
   * To set parent and after relations automatically from context
   */
  makeTaskProxy(parent_id: number): TaskContextHandlers{
    return {
      create: this.createChild.bind(this, parent_id),
      group: this.group.bind(this, parent_id),
      getTask: this.getTask.bind(this),
    }
  }
}
