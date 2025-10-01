import {debuglog, format} from 'node:util';
import {Client, ClientBase, Notification, Pool, PoolClient, PoolConfig, QueryResultRow, types as pgtypes} from 'pg';
import { DatabaseHandle, toHandle } from '../vfs/helpers/db.js';
import { takeOne } from './queue.js';
import { ResolvedTaskDefinition, TaskDefinition, TaskHandler, TaskHandlerContext, TaskHandlerParams, TaskLogger, TaskStatus } from './types.js';
import { TaskListener } from './listener.js';
import Vfs from '../vfs/index.js';
import UserManager from '../auth/UserManager.js';


const debug = debuglog("tasks:processor");

export interface TaskProcessorParams{
  client: Client;
  vfs: Vfs;
  userManager: UserManager;
}


export class TaskProcessor extends TaskListener{

  #current_task:number|null = null;
  #control = new AbortController();
  #context: TaskHandlerContext;

  public handlers = new Map<string, TaskHandler>();

  constructor({client, vfs, userManager}: TaskProcessorParams){
    super({client});
    this.#context = {vfs, userManager};
    this.on("aborting", this.onAbortTask);
    this.on("pending", this.onNewTask);
  }

  async start(){
    return await super.start(["pending", "aborting"]);
  }

  addHandler(name: string, h: TaskHandler){
    if(this.handlers.has(name)) throw new Error("Duplicate task handler name: "+name);
    this.handlers.set(name, h);
  }


  onNewTask = (task_id: number)=>{
    this.takeTask().then(
      ()=>debug("Polled task pool"),
      (err)=>console.error("Failed to poll task pool :", err)
    );
  }

  takeTask = takeOne((async function takeTask(this: TaskProcessor){
    let task = await this.acquireTask();
    if(!task) return;
    this.#current_task = task.task_id;
    const {signal} = this.#control = new AbortController();
    debug(`Acquired task #${task.task_id}`);
    try{
      await this.processTask({task, signal});
      await this.releaseTask(task.task_id);
    }catch(e:any){
      await this.errorTask(task.task_id, e);
    }finally{
      this.#current_task = null;
    }
  }).bind(this));

  /**
   * Get an exclusive lock over an available task and marks it as running 
   */
  async acquireTask() :Promise<TaskDefinition|undefined>{
    return await this.db.get<TaskDefinition>(`
      UPDATE tasks SET status = 'running'
      WHERE task_id = (
        SELECT tasks.task_id 
        FROM tasks
          LEFT JOIN tasks AS parent_task ON tasks.parent = parent_task.task_id 
        WHERE tasks.status = 'pending' 
          AND tasks.type = ANY($1::text[])
          AND (
            parent_task IS NULL
            OR parent_task.status = 'success'
          )
        FOR UPDATE OF tasks SKIP LOCKED
        LIMIT 1
      )
      RETURNING *`, [ [...this.handlers.keys()] ]);
  }

  onAbortTask =(id: number)=>{
    if(id == this.#current_task) this.#control.abort();
  }

  async appendTaskLog(id: number, severity: keyof TaskLogger,  message: string){
    await this.db.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, $2, $3)`, [id, severity, message]);
  }

  getTaskLogger(id: number){
    return {
      debug: (...args:any[])=>this.appendTaskLog(id, 'debug', format(...args)),
      log: (...args:any[])=>this.appendTaskLog(id, 'log', format(...args)),
      warn: (...args:any[])=>this.appendTaskLog(id, 'warn', format(...args)),
      error: (...args:any[])=>this.appendTaskLog(id, 'error', format(...args)),
    }
  }

  /**
   * Marks a task as completed
   */
  async releaseTask(id: number){
    debug(`Release task #${id}`);
    return await this.setTaskStatus(id, "success");
  }

  async errorTask(id: number, msg?: Error|string){
    debug(`Log error for task #${id}:`, msg);
    if(msg){
      const message = (typeof msg == "object" && "message" in msg)? msg.message:msg;
      try{
        await this.appendTaskLog(id, "error", message);
      }catch(e: any){
        console.error("While trying to save task error log:", e);
      }
    }
    return await this.setTaskStatus(id, "error");
  }

  /**
   * Actual task processing.
   * Throw as needed to be caught by this.errorTask
   * Upon completion, task is released.
   */
  async processTask({task, signal}: {task:TaskDefinition, signal: AbortSignal}){
    const handler = this.handlers.get(task.type);
    if(!handler) throw new Error(`Invalid task type ${task.type} in task #${task.task_id}: matches no handler`);
    debug(`Resolving task #${task.task_id}`);
    const resolved = await this.resolveTask(task.task_id);
    debug(`Processing task #${task.task_id}`);
    /** @fixme add logger */
    handler({task: resolved, logger: this.getTaskLogger(task.task_id), signal, context: this.#context});
  }
}

