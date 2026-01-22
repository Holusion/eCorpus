import { debuglog, format } from "node:util";
import { Writable } from 'node:stream';
import { HTTPError } from "../utils/errors.js";
import { Database, DatabaseHandle } from "../vfs/helpers/db.js";
import { Queue } from "./queue.js";
import { CreateRunTaskParams, RunTaskParams, TaskContextHandlers, TaskData, TaskDefinition, TaskHandler, TaskHandlerContext, TaskPackage, TaskSchedulerContext, TaskSettledCallback, } from "./types.js";
import { createLogger } from "./logger.js";
import { TaskManager } from "./manager.js";




export class TaskScheduler<TContext extends {db:DatabaseHandle} = TaskSchedulerContext> extends TaskManager{
  readonly #queue = new Queue(4);


  public get context(){
    return this._context;
  }


  constructor(protected _context :TContext){
    super(_context.db);
  }

  async close(){
    await this.#queue.close();
  }

  private async _run<T extends TaskData, U=any>(handler:TaskHandler<T, U, TContext>,task: TaskDefinition<T>, {signal:taskSignal}:{signal?:AbortSignal}= {}){
    const work :TaskPackage = async ({signal: queueSignal})=>{
      await using logger = createLogger(this.db, task.task_id);
      const context: TaskHandlerContext<TContext> = {
        ...this.context,
        tasks: this.childContext(task.task_id),
        logger,
        signal: taskSignal? (AbortSignal as any).any([taskSignal, queueSignal]): queueSignal,
      };

      await this.setTaskStatus(task.task_id, "running");
      return await handler.call(context, {context, inputs: new Map(), task});
    }
    try{
      const output = await this.#queue.add(work);
      await this.releaseTask(task.task_id, output);
      return output;
    }catch(e: any){
      await this.errorTask(task.task_id, e).catch(e=> console.error("Failed to set task error : ", e));
      throw e;
    }
  }

  /**
   * Registers a task to run immediately and wait for its completion
   */
  async run<T extends TaskData, U=any>({task, handler}: RunTaskParams<T, U, TContext>, callback?:TaskSettledCallback<U> ): Promise<U>;
  async run<T extends TaskData, U=any>({scene_id, user_id, type, data, handler, signal}: CreateRunTaskParams<T, U, TContext>, callback?:TaskSettledCallback<U>): Promise<U>;
  async run<T extends TaskData, U=any>(params: CreateRunTaskParams<T, U, TContext>|RunTaskParams<T,U, TContext>, callback?:TaskSettledCallback<U>): Promise<U>{
    let task: TaskDefinition<T>;
    if("task" in params){
      task = params.task;
    }else{
      task = await this.create<T>({...params, type: params.type ?? params.handler.name});
    }
    const _p = this._run(params.handler, task);

    if(typeof callback=== "function"){
      _p.then((value)=>callback(null, value), (err)=>callback(err));
    }
    return _p;
  }

  /**
   * Join a task that has been created through {@link queue}
   */
  async join(task_id: number){
    //It's yet unclear if this is really needed
    throw new Error("Unimplemented");
  }

  /**
   * in-context task scheduling methods
   */
  private childContext(id: number) :TaskContextHandlers&AsyncDisposable{

    return {
      create: function <T extends TaskData, U=any>(p: CreateRunTaskParams<T, U>): Promise<U> {
        throw new Error("Function not implemented.");
      },
      getTask: function <T extends TaskData = TaskData>(id: number): Promise<TaskDefinition<T>> {
        throw new Error("Function not implemented.");
      },
      group: function (cb: (context: TaskContextHandlers) => Promise<number[]> | AsyncGenerator<number, void, unknown>, remap?: any): Promise<number> {
        throw new Error("Function not implemented.");
      },
      async [Symbol.asyncDispose](){

      }
    }
  }

}