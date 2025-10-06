import {debuglog, format} from 'node:util';
import {Client } from 'pg';
import { takeOne } from './queue.js';
import {  CreateTaskParams, TaskContextHandlers, TaskDefinition, TaskHandler, TaskHandlerContext, TaskLogger, TaskType, TaskTypeData } from './types.js';
import { TaskListener } from './listener.js';
import Vfs from '../vfs/index.js';
import UserManager from '../auth/UserManager.js';

import * as tasks from "./handlers/index.js";

const debug = debuglog("tasks:processor");
const debug_logs = debuglog("tasks:logs");

export interface TaskProcessorParams{
  client: Client;
  vfs: Vfs;
  userManager: UserManager;
}


export class TaskProcessor extends TaskListener{

  #current_task:number|null = null;
  #control = new AbortController();
  #context: Pick<TaskHandlerContext, "vfs"|"userManager">;


  constructor({client, vfs, userManager}: TaskProcessorParams){
    super({client});
    this.#context = {vfs, userManager};
    this.on("aborting", this.onAbortTask);
    this.on("pending", this.onNewTask);
  }

  async start(){
    return await super.start(["pending", "aborting"]);
  }

  async stop(){
    this.#control.abort();
    await super.stop();
  }


  onNewTask = (task_id: number)=>{
    debug("Task available:", task_id);
    this.takeTask().then(
      ()=>debug("Polled task pool"),
      (err)=>console.error("Failed to poll task pool :", err)
    );
  }

  takeTask = takeOne((async function takeTask(this: TaskProcessor){
    debug("Acquiring task");
    let id = await this.acquireTask();
    if(!id){
      debug("No matched task");
      return;
    }
    const task = await this.getTask(id);
    this.#current_task = task.task_id;
    const {signal} = this.#control = new AbortController();
    debug(`Acquired task #${task.task_id}`);
    try{
      let result = await this.processTask({task: task as any, signal});
      await this.releaseTask(task.task_id, result);
    }catch(e:any){
      await this.errorTask(task.task_id, e);
    }finally{
      this.#current_task = null;
    }
    this.takeTask();
  }).bind(this));

  /**
   * Get an exclusive lock over an available task and marks it as running 
   */
  async acquireTask() :Promise<number|undefined>{
    let t = await this.db.get<{task_id: number}>(`
      UPDATE tasks 
      SET status = 'running'
      WHERE tasks.task_id = (
        SELECT 
          tasks.task_id
        FROM tasks
          LEFT JOIN tasks_relations ON target = tasks.task_id
          LEFT JOIN tasks AS source_tasks ON (source = source_tasks.task_id AND source_tasks.status != 'success')
        WHERE tasks.status = 'pending'
          AND tasks.type = ANY($1::text[])
          AND source_tasks.task_id IS NULL
        FOR UPDATE OF tasks SKIP LOCKED
        LIMIT 1
      )
      RETURNING *`, [ Object.keys(tasks) ]);
      if(!t) return;
      console.log("#%d runs after: ", t.task_id, await this.db.all(`SELECT source_tasks.task_id, source_tasks.status
            FROM tasks_relations
              INNER JOIN tasks AS source_tasks ON source = source_tasks.task_id
            WHERE target = $1
              AND source_tasks.status != 'success'`, [t.task_id]));
      return t.task_id;
  }

  onAbortTask =(id: number)=>{
    if(id == this.#current_task) this.#control.abort();
  }

  async appendTaskLog(id: number, severity: keyof TaskLogger,  message: string){
    debug_logs(`${id} [${severity}]: ${message}`);
    await this.db.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, $2, $3)`, [id, severity, message]);
  }



  /**
   * Marks a task as completed
   */
  async releaseTask(id: number, output: any = null){
    debug(`Release task #${id}:`, output);
    await this.db.run(`UPDATE tasks SET status = 'success', output = $2 WHERE task_id = $1`, [id, JSON.stringify(output)]);
  }

  /**
   * @fixme use task.output to store the error message?
   */
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
    try{
      await this.setTaskStatus(id, "error");
    }catch(e){
        console.error("While trying to set task status:", e);
    }
  }

  /**
   * Actual task processing.
   * Throw as needed to be caught by this.errorTask
   * Upon completion, task is released.
   */
  async processTask<T extends TaskType>({task, signal}: {task:TaskDefinition<TaskTypeData<T>>, signal: AbortSignal}){
    const handler = tasks[task.type as keyof typeof tasks] as TaskHandler<TaskTypeData<T>>;
    if(!handler) throw new Error(`Invalid task type ${task.type} in task #${task.task_id}: matches no handler`);
    debug(`Resolving task #${task.task_id}`);
    debug(`Processing task #${task.task_id}`, task);
    const id = task.task_id;
    return await handler({task, context: {
      ...this.#context,
      logger: {
        debug: (...args:any[])=>this.appendTaskLog(id, 'debug', format(...args)),
        log: (...args:any[])=>this.appendTaskLog(id, 'log', format(...args)),
        warn: (...args:any[])=>this.appendTaskLog(id, 'warn', format(...args)),
        error: (...args:any[])=>this.appendTaskLog(id, 'error', format(...args)),
      },
      tasks: this.makeTaskProxy(task.fk_scene_id, id),
      signal,
    }});
  }
}

