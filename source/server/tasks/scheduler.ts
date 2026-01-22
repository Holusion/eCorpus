import {debuglog} from "node:util";
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { Queue } from "./queue.js";
import { CreateRunTaskParams, CreateTaskParams, ITaskLogger, RunTaskParams, TaskDataPayload, TaskDefinition, TaskHandler, TaskHandlerContext, TaskPackage, TaskSchedulerContext, TaskSettledCallback, TaskStatus, } from "./types.js";
import { createLogger } from "./logger.js";
import { TaskManager } from "./manager.js";
import { BadRequestError, InternalError } from "../utils/errors.js";


import * as userHandlers from "./handlers/index.js";
// Note: previously used stream/once for generator bridge; no longer required for Promise.all-style group


const debug = debuglog("tasks:scheduler");


interface AsyncContext{
  queue: Queue;
  parent: {
    task_id: number;
    user_id: number|null;
    scene_id: number|null;
    logger:ITaskLogger;
  } | null;
}

type NestContextProps = {
  name: string;
  parent: AsyncContext["parent"];
  /**
   * Tasks concurrency for this context. Default is 1 (except for the root context).
   * Infinity can be provided if we don't care.
   */
  concurrency: number;
}

// Work must be a callable that, when invoked inside `nest`, returns
// an iterable of promises. This ensures the promises are created
// in the nested async context (covers both factory functions and
// generator functions — calling them produces an iterator).
type GroupWorkload<T> = () => Iterable<Promise<T>>;
export function isUserHandlerType(t: string):t is keyof typeof userHandlers{
  return t in userHandlers;
}


export class TaskScheduler<TContext extends {db:DatabaseHandle} = TaskSchedulerContext> extends TaskManager{
  //Do not use "real" private members here because they would be missed by Object.create
  /** Work queue. One should never use this directly */
  private readonly rootQueue = new Queue(4, "root");


  public get taskContext(){
    return this._context;
  }

  public get concurrency(){
    return this.rootQueue.limit;
  }
  public set concurrency(value){
    this.rootQueue.limit = value;
  }

  public get closed(){
    return this.rootQueue.closed;
  }

  constructor(protected _context :TContext){
    super(_context.db);

    //AsyncLocalStorage is here instead of as a class member because we want to only use it through the interfaces provided below
    const asyncStore = new AsyncLocalStorage();
    this.context = () =>{
      return (asyncStore.getStore() as any ?? {queue: this.rootQueue, parent: null}) satisfies AsyncContext;
    }
    this.nest = async ({parent, name, concurrency=1}, work, ...args)=>{
    const q = new Queue(concurrency, name);
      try{
        return await asyncStore.run({queue:q, parent} satisfies AsyncContext, work, ...args);
      }finally{
        await q.close();
      }
    }
  }

  /**
   * Close the scheduler gracefully
   * @param timeoutMs Maximum time to wait for active tasks to complete. Defaults to 30 seconds.
   */
  async close(timeoutMs?: number){
    await this.rootQueue.close(timeoutMs);
    super.close();
  }
  /**
   * Retrieve the current async context
   * 
   * Async contexts allow nesting calls to {@link TaskScheduler.run()} without risking a deadlock:
   * Each nesting level gets its own concurrency context with a default concurrency of one.
   */
  public readonly context: () => AsyncContext;
  /**
   * Run `work` inside a new async context with the given name and concurrency settings
   */
  public readonly nest: <T extends any[]= any[], U=any>(props:NestContextProps, work:(...args: T)=>U, ...args: T)=>Promise<U>;


  private async _run<T extends TaskDataPayload, U=any>(handler:TaskHandler<T, U, TContext>,task: TaskDefinition<T>, {signal:taskSignal}:{signal?:AbortSignal}= {}){
    const work :TaskPackage = async ({signal: queueSignal})=>{
      await using logger = createLogger(this.db, task.task_id);
      const context: TaskHandlerContext<TContext> = {
        ...this.taskContext,
        tasks: Object.create(this),
        logger,
        signal: taskSignal? (AbortSignal as any).any([taskSignal, queueSignal]): queueSignal,
      };

      const thisContext:AsyncContext["parent"] = {
        task_id: task.task_id,
        scene_id: task.scene_id,
        user_id: task.user_id,
        logger,
      };

      await this.takeTask(task.task_id);
      return await this.nest({concurrency: 1, name: `${task.type}#${task.task_id.toString()}`, parent: thisContext}, handler.bind(context),  {context, task})
    }
    
    try{
      const async_ctx = this.context();
      //Custom name for work to be shown in stack traces
      Object.defineProperty(work, 'name', { value: `TaskScheduler.payload<${task.type}>(${task.task_id})@${async_ctx.queue.name}` });
      if(async_ctx.parent?.logger){
        async_ctx.parent.logger.debug(`Schedule child task ${task.type}#${task.task_id}`);
      }
      debug("Schedule work for task #%d on Queue(%s)", task.task_id, async_ctx.queue.name);
      const output = await async_ctx.queue.add(work);
      await this.releaseTask(task.task_id, output);
      return output;
    }catch(e: any){
      //Here we might make an exception if e.name === "AbortError" and the database is closed
      await this.errorTask(task.task_id, e).catch(e=> console.error("Failed to set task error : ", e));
      throw e;
    }
  }

  /**
   * Registers a task to run as soon as possible and wait for its completion
   * It's OK to ignore the returned promise if a callback is provided to at least properly log the error
   * 
   * `TaskScheduler.run()` uses async context tracking to inherit **scene_id**, **user_id** and **parent** from it's context
   * However those can still be forced to another value if deemed necessary.
   * Whether or not this override is desirable is yet unclear.
   */
  async run<T extends TaskDataPayload, U=any>({task, handler}: RunTaskParams<T, U, TContext>, callback?:TaskSettledCallback<U> ): Promise<U>;
  async run<T extends TaskDataPayload, U=any>({scene_id, user_id, type, data, handler, signal}: CreateRunTaskParams<T, U, TContext>, callback?:TaskSettledCallback<U>): Promise<U>;
  async run<T extends TaskDataPayload, U=any>(params: CreateRunTaskParams<T, U, TContext>|RunTaskParams<T,U, TContext>, callback?:TaskSettledCallback<U>): Promise<U>{
    let task: TaskDefinition<T>;
    if("task" in params){
      //We allow externally-created tasks here. But we want to limit error sources so we re-fetch the task anyway
      //If this ends up being used in practice, we may need perform validation that the given task actually matches the stored one.
      task = await this.getTask(params.task.task_id);
    }else{
      //We use context to inherit parent, user_id and scene_id
      //But if different values are explicitly specified it's possible to "break out"
      //Whether or not this is 
      const {parent} = this.context();
      task = await this.create<T>({
        ...params,
        data: params.data as any,
        type: (params.type ?? params.handler.name) as string,
        status: "pending" as TaskStatus,
        parent: parent?.task_id ?? null,
      });
    }
    const _p = this._run( params.handler, task);

    if(typeof callback=== "function"){
      _p.then((value)=>callback(null, value), (err)=>callback(err));
    }
    return _p;
  }

  /**
   * Run a user-created task. Does not check for permissions
   * @param task_id 
   */
  async runUserTask(task:TaskDefinition){
    // _run will check that status is in ('pending', 'initializing') again when it executes the callback
    // Here we just check against usage errors
    if(task.status !== "initializing") throw new InternalError(`Task #${task.task_id} has status: ${task.status}. It can't be started`);
    if(!isUserHandlerType(task.type)) throw new BadRequestError(`Task type ${task.type} can not be user-created`);
    if(debug.enabled){
      let text = `Run user task ${task.type}#${task.task_id}`;
      if(task.scene_id) text += ` on scene ${task.scene_id}`;
      if(task.user_id) text+= ` for user ${task.user_id}`;
      debug(text);
    }
    return await this.run({task, handler: userHandlers[task.type] as any});
  }

  /**
   * Create a task with async-context awareness
   * This is exposed in case it is ever needed but it's probably always better to call {@link TaskScheduler.run}
   * {@link TaskManager.create} for the base method
   */
  override async create<T extends TaskDataPayload = any>(params: CreateTaskParams<T>): Promise<TaskDefinition<T>> {
    const {parent} = this.context();
    if(parent) debug(`Inherit values from Parent task #${parent.task_id}: ${parent.scene_id?"Scene: "+parent.scene_id:""} ${parent.user_id?"User: "+parent.user_id:""}`);
    if(!params.scene_id && parent?.scene_id) params.scene_id = parent.scene_id;
    if(!params.user_id && parent?.user_id) params.user_id = parent.user_id;
    if(!params.parent && parent?.task_id) params.parent = parent.task_id;
    return await super.create(params);
  }

  /**
   * Join a task that has been created through {@link queue}
   */
  async join(task_id: number){
    //It's yet unclear if this is really needed
    throw new Error("Unimplemented");
  }

  /**
   * Sometimes we want the concurrency settings to be ignored.
   * This creates an internal context with infinite concurrency that allows everything to run in parallel
   * @TODO : allow generators here
   */
  // Accept either a generator function or a factory that returns an iterable of promises.
  group<T>(work: () => Generator<Promise<T>, any, any>): Promise<T[]>;
  group<T>(work: () => Iterable<Promise<T>>): Promise<T[]>;
  group<T>(work: () => Generator<Promise<T>, any, any>|Iterable<Promise<T>>): Promise<T[]> {
    const async_ctx = this.context();
    if (async_ctx.parent?.logger) {
      async_ctx.parent.logger.debug(`Create tasks group`);
    }

    if (typeof work !== 'function') throw new TypeError('group expects a function (factory or generator function)');

    // Run once inside nest so the iterable is created and consumed in the nested async context
    return this.nest({ name: `${async_ctx.queue.name}[GROUP]`, parent: async_ctx.parent, concurrency: Infinity }, async () => {
      const iterable = (work as () => Iterable<Promise<T>>)();
      // materialize inside nested context so iterator.next() runs under nest
      const arr = [...iterable];
      return await Promise.all(arr);
    }) as unknown as Promise<T[]>;
  }

}