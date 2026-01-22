import { debuglog, format } from "node:util";
import { Writable } from 'node:stream';
import { HTTPError } from "../utils/errors.js";
import { Database } from "../vfs/helpers/db.js";
import { Queue } from "./queue.js";
import { CreateTaskParams, TaskContextHandlers, TaskData, TaskDefinition, TaskHandler, TaskHandlerContext, TaskPackage, TaskSchedulerContext, } from "./types.js";
import { createLogger } from "./logger.js";
import { TaskManager } from "./manager.js";




export class TaskScheduler extends TaskManager{
  readonly #queue = new Queue(4);


  public get context(){
    return this._context;
  }


  constructor(protected _context :TaskSchedulerContext){
    super(_context.db);
  }

  async close(){
    await this.#queue.close();
  }


  private async _run<T extends TaskData, U=any>(handler:TaskHandler<T, U>,task: TaskDefinition<T>, {signal:taskSignal}:{signal?:AbortSignal}= {}){
    const work :TaskPackage<typeof handler> = async ({signal: queueSignal})=>{
      await using logger = createLogger(this.db, task.task_id);
      const context = {
        ...this.context,
        tasks: this.contextScheduler(),
        logger,
        signal: taskSignal? (AbortSignal as any).any([taskSignal, queueSignal]): queueSignal,
      } satisfies TaskHandlerContext;

      await this.setTaskStatus(task.task_id, "running");
      return await handler.call(context, {context, inputs: new Map(), task});
    }
    try{
      const output = await this.#queue.add(work);
      this.releaseTask(task.task_id, output);
      return output;
    }catch(e: any){
      this.errorTask(task.task_id, e).catch(e=> console.error("Failed to set task error : ", e));
      throw e;
    }
  }

  /**
   * Registers a task to run immediately and wait for its completion
   */
  async run<T extends TaskData, U=any>({scene_id=null, user_id=null, data, handler, signal}: CreateTaskParams<T, U>): Promise<U>{
    const type = handler.name;
    if(!type) throw new Error("Can't create an anonymous task");
    const task = await this.create<T>(scene_id, user_id, {type, data, status: "pending"});
    return await this._run(handler, task);
  }

  /**
   * Create a task and return immediately with the task id
   * 
   * The task will be run out-of-band
   */
  async queue<T extends TaskData, U=any>({scene_id=null, user_id=null, data, handler, signal}: CreateTaskParams<T, U>): Promise<number>{
    const type = handler.name;
    if(!type) throw new Error("Can't create an anonymous task");
    const task = await this.create<T>(scene_id, user_id, {type, data, status: "pending"});
    this._run(handler, task).catch((e)=>{
      console.log("Asynchronous task error :", e);
    });
    return task.task_id;
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
  private contextScheduler(){
    return {
      create: function <T extends TaskData, U=any>(p: CreateTaskParams<T, U>): Promise<U> {
        throw new Error("Function not implemented.");
      },
      getTask: function <T extends TaskData = TaskData>(id: number): Promise<TaskDefinition<T>> {
        throw new Error("Function not implemented.");
      },
      group: function (cb: (context: TaskContextHandlers) => Promise<number[]> | AsyncGenerator<number, void, unknown>, remap?: any): Promise<number> {
        throw new Error("Function not implemented.");
      }
    }
  }

}