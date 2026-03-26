import { debuglog } from "node:util";
import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { Queue } from "./queue.js";
import { CreateRunTaskParams, CreateTaskParams, ITaskLogger, RunOptions, RunTaskParams, TaskDataPayload, TaskDefinition, TaskHandler, TaskHandlerContext, TaskPackage, TaskSchedulerContext, TaskSettledCallback, TaskStatus, } from "./types.js";
import { createLogger } from "./logger.js";
import { TaskManager } from "./manager.js";
import { BadRequestError, InternalError } from "../utils/errors.js";

// Note: previously used stream/once for generator bridge; no longer required for Promise.all-style group


const debug = debuglog("tasks:scheduler");


interface AsyncContext {
  queue: Queue;
  parent: {
    task_id: number;
    user_id: number | null;
    scene_id: number | null;
    logger: ITaskLogger;
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


export class TaskScheduler<TContext extends { db: DatabaseHandle } = TaskSchedulerContext> extends TaskManager {
  //Do not use "real" private members here because they would be missed by Object.create
  /** 
   * Work queue. used internally by {@link TaskScheduler.run} to run jobs
   * */
  private readonly rootQueue = new Queue(4, "root");


  public get taskContext() {
    return this._context;
  }

  public get concurrency() {
    return this.rootQueue.limit;
  }
  public set concurrency(value) {
    this.rootQueue.limit = value;
  }

  public get closed() {
    return this.rootQueue.closed;
  }

  constructor(protected _context: TContext) {
    super(_context.db);

    //AsyncLocalStorage is here instead of as a class member
    // because we want to only use it through the interfaces provided below
    const asyncStore = new AsyncLocalStorage();
    this.context = () => {
      return (asyncStore.getStore() as any ?? { queue: this.rootQueue, parent: null }) satisfies AsyncContext;
    }
    this.nest = async ({ parent, name, concurrency = 1 }, work, ...args) => {
      const q = new Queue(concurrency, name);
      try {
        return await asyncStore.run({ queue: q, parent } satisfies AsyncContext, work, ...args);
      } finally {
        await q.close();
      }
    }
  }

  /**
   * Close the scheduler gracefully
   * @param timeoutMs Maximum time to wait for active tasks to complete. Defaults to 30 seconds.
   */
  async close(timeoutMs?: number) {
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
   * Calls to {@link TaskScheduler._run} within this async context will resolve to the nested Queue
   */
  public readonly nest: <T extends any[] = any[], U = any>(props: NestContextProps, work: (...args: T) => U, ...args: T) => Promise<U>;


  /**
   * Internal task running handler.
   * 
   * Builds a context and actually schedule the task, handling the status change from `"pending"` to `"running"` and to `"complete"|"error"`
   * 
   * Unless there is a problem with the database connection, the task is guaranteed to end up with `status = "complete"|"error"`
   * @param handler Handler functionthat will perform the job
   * @param task Task definition
   * @param param2 Additional options for the task runner
   * @param param2.immediate jumps the queue and run the task immediately regardless of concurrency settings
   * @returns 
   */
  private async _run<T extends TaskDataPayload, U = any>(
    handler: TaskHandler<T, U, TContext>,
    task: TaskDefinition<T>,
    { signal: taskSignal, immediate }: RunOptions = {}
  ) {
    // Create a wrapper function around the handler to provide the task's execution context
    // and set its status
    const work: TaskPackage = async ({ signal: queueSignal }) => {
      await using logger = createLogger(this.db, task.task_id);
      const context: TaskHandlerContext<TContext> = {
        ...this.taskContext,
        tasks: Object.create(this),
        logger,
        signal: taskSignal ? (AbortSignal as any).any([taskSignal, queueSignal]) : queueSignal,
      };

      const thisContext: AsyncContext["parent"] = {
        task_id: task.task_id,
        scene_id: task.scene_id,
        user_id: task.user_id,
        logger,
      };

      await this.takeTask(task.task_id);
      try {
        const output = await this.nest({ concurrency: 1, name: `${task.type}#${task.task_id.toString()}`, parent: thisContext }, handler.bind(context), { context, task })
        await this.releaseTask(task.task_id, output);
        return output;
      } catch (e: any) {
        //Here we might make an exception if e.name === "AbortError" and the database is closed
        await this.errorTask(task.task_id, e).catch(e => console.error("Failed to set task error : ", e));
        throw e;
      }
    }

    const async_ctx = this.context();
    //Custom name for work to be shown in stack traces
    Object.defineProperty(work, 'name', { value: `TaskScheduler.payload<${task.type}>(${task.task_id})@${async_ctx.queue.name}` });
    if (async_ctx.parent?.logger) {
      async_ctx.parent.logger.debug(`Schedule child task ${task.type}#${task.task_id}`);
    }
    debug("Schedule work for task #%d on Queue(%s)", task.task_id, async_ctx.queue.name);
    return await (immediate ? async_ctx.queue.unshift(work) : async_ctx.queue.add(work));
  }

  /**
   * Registers a task to run as soon as possible and wait for its completion.
   * 
   * It's OK to ignore the returned promise if a callback is provided to at least properly log the error
   * 
   * `TaskScheduler.run()` uses async context tracking to inherit **scene_id**, **user_id** and **parent** from it's context
   * However those can still be forced to another value if deemed necessary.
   * Whether or not this override is desirable is yet unclear.
   */
  async run<T extends TaskDataPayload, U = any>(
    params: CreateRunTaskParams<T, U, TContext>,
    callback?: TaskSettledCallback<U>
  ): Promise<U> {
    //We use context to inherit parent, user_id and scene_id
    //But if different values are explicitly specified it's possible to "break out"
    //Whether or not this is 
    const { parent } = this.context();
    const task: TaskDefinition<T> = await this.create<T>({
      ...params,
      data: params.data as any,
      type: (params.type ?? params.handler.name) as string,
      status: "pending" as TaskStatus,
      parent: parent?.task_id ?? null,
    });
    const _p = this._run(params.handler, task, { signal: params.signal, immediate: params.immediate });

    if (typeof callback === "function") {
      _p.then((value) => callback(null, value), (err) => callback(err));
    }
    return _p;
  }


  /**
   * Run a handler on an externally-created task definition
   * 
   * This is less safe than {@link TaskScheduler.run} because we _trust_ the task definition to be up to date. It's an error to call it with a stale task definition. 
   * @param param0 
   * @param callback 
   */
  async runTask<T extends TaskDataPayload, U = any>({ task, signal, handler }: RunTaskParams<T, U, TContext>, callback?: TaskSettledCallback<U>): Promise<U> {
    const _p = this._run(handler, task, { signal: signal, immediate: false });
    if (typeof callback === "function") {
      _p.then((value) => callback(null, value), (err) => callback(err));
    }
    return _p;
  }


  /**
   * Create a task with async-context awareness
   * This is exposed in case it is ever needed but it's probably always better to call {@link TaskScheduler.run}
   * {@link TaskManager.create} for the base method
   */
  override async create<T extends TaskDataPayload = any>(params: CreateTaskParams<T>): Promise<TaskDefinition<T>> {
    const { parent } = this.context();
    if (parent) debug(`Inherit values from Parent task #${parent.task_id}: ${parent.scene_id ? "Scene: " + parent.scene_id : ""} ${parent.user_id ? "User: " + parent.user_id : ""}`);
    if (!params.scene_id && parent?.scene_id) params.scene_id = parent.scene_id;
    if (!params.user_id && parent?.user_id) params.user_id = parent.user_id;
    if (!params.parent && parent?.task_id) params.parent = parent.task_id;
    return await super.create(params);
  }

  /**
   * Join a task that has been created through {@link queue}
   */
  async join(task_id: number) {
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
  group<T>(work: () => Generator<Promise<T>, any, any> | Iterable<Promise<T>>): Promise<T[]> {
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