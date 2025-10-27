import {debuglog, format} from 'node:util';
import {Client } from 'pg';
import { takeOne } from './queue.js';
import { TaskDefinition, TaskHandler, TaskHandlerContext, TaskLogger, TaskType, TaskTypeData } from './types.js';
import { TaskListener } from './listener.js';
import Vfs from '../vfs/index.js';
import UserManager from '../auth/UserManager.js';

import * as tasks from "./handlers/index.js";
import { Config } from '../utils/config.js';

const debug = debuglog("tasks:processor");
const debug_outputs = debuglog("tasks:outputs");

export interface TaskProcessorParams{
  client: Client;
  vfs: Vfs;
  userManager: UserManager;
  config: Config;
}


export class TaskProcessor extends TaskListener{

  #current_task:number|null = null;
  #control = new AbortController();
  #context: Pick<TaskHandlerContext, "vfs"|"userManager"|"config">;


  constructor({client, vfs, userManager, config}: TaskProcessorParams){
    super({client});
    this.#context = {vfs, userManager, config};
    this.on("update", (id, status)=>{
      if(status == "pending") this.onNewTask(id);
      else if(status == "aborting") this.onAbortTask(id);
    });
  }

  async start(){
    await super.start(["pending", "aborting"]);
    this.pollTasks();

  }

  async stop(){
    this.#control.abort();
    await super.stop();
  }


  onNewTask = (task_id: number)=>{
    debug("Task available:", task_id);
    this.pollTasks();
  }

  /**
   * Safe synchronous wrapper around takeTask that will handle any error that might be thrown asynchronously
   */
  pollTasks(){
    this.takeTask().catch((err)=>console.error("Failed to poll task pool :", err));
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
    debug(`Acquired task ${task.type}#${task.task_id}`);
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
   * 
   * We are not concerned about the inner's select possible race conditions because:
   *  - tasks that are "success" are never going back
   *  - a task can't be the target of more relations once it's created and in the "pending" state.
   */
  async acquireTask() :Promise<number|undefined>{
    let t = await this.db.get<{task_id: number}>(`
      UPDATE tasks 
      SET status = 'running'
      WHERE tasks.task_id = (
        SELECT 
          tasks.task_id
        FROM tasks
        WHERE tasks.status = 'pending'
          AND NOT EXISTS (
            SELECT 1
            FROM tasks_relations
            LEFT JOIN tasks AS source_tasks ON (tasks_relations.source = source_tasks.task_id)
            WHERE tasks_relations.target = tasks.task_id
              AND source_tasks.status != 'success'
          )
          AND tasks.type = ANY($1::text[])
        FOR UPDATE OF tasks SKIP LOCKED
        LIMIT 1
      )
      RETURNING *`, [ Object.keys(tasks) ]);
      if(!t) return;
      return t.task_id;
  }

  onAbortTask =(id: number)=>{
    if(id == this.#current_task) this.#control.abort();
  }

  wrapLog(id: number, severity: keyof TaskLogger,  message: string):void{
    this.appendTaskLog(id, severity, message).catch(e=>{
      if(this.started) console.error("Failed to write task log for #%d [%s]", id, severity, message);
    });
  }


  /**
   * Marks a task as completed
   */
  async releaseTask(id: number, output: any = null){
    debug_outputs(`Release task #${id}`, output);
    await this.db.run(`UPDATE tasks SET status = 'success', output = $2 WHERE task_id = $1`, [id, JSON.stringify(output)]);
  }

  /**
   * @fixme use task.output to store the error message?
   */
  async errorTask(id: number, msg?: Error|string){
    if(msg){
      const message = (msg instanceof Error)? msg.stack ?? msg.message: msg;
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
    if(!handler) throw new Error(`Invalid task type ${task.type} for #${task.task_id}: matches no handler`);
    const id = task.task_id;

    const context = {
      ...this.#context,
      logger: {
        debug: (...args:any[])=>this.wrapLog(id, 'debug', format(...args)),
        log: (...args:any[])=>this.wrapLog(id, 'log', format(...args)),
        warn: (...args:any[])=>this.wrapLog(id, 'warn', format(...args)),
        error: (...args:any[])=>this.wrapLog(id, 'error', format(...args)),
      },
      tasks: this.makeTaskProxy(id),
      db: this.db,
      signal,
    };

    let inputs = new Map<number,any>(task.after.length? (await this.db.all(`
      SELECT 
        output,
        task_id 
      FROM tasks 
      WHERE task_id = ANY($1::bigint[]) AND status = 'success' 
      ORDER BY task_id ASC
    `, [task.after])).map(t=>([t.task_id,t.output])) : []);
    if(inputs.size != task.after.length){
      const missing = task.after.filter(id=>!inputs.has(id));
      throw new Error(`Expected ${task.after.length} inputs, but ${inputs.size} were returned. Received [${Array.from(inputs.keys()).join(", ")}]. Missing Task id${1< missing.length?"s":""}: [${missing.join(", ")}]`);
    }
    debug(`Process task ${task.type}#${task.task_id}`);
    return await handler({
      task,
      context,
      inputs,
    });
  }
}

