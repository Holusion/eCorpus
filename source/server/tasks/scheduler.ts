import { AsyncLocalStorage } from 'node:async_hooks';
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { Queue } from "./queue.js";
import { CreateRunTaskParams, CreateTaskParams, ITaskLogger, RunOptions, RunTaskParams, TaskDataPayload, TaskDefinition, TaskHandler, TaskHandlerContext, TaskPackage, TaskSchedulerContext, TaskSettledCallback, TaskStatus, } from "./types.js";
import { createLogger } from "./logger.js";
import { TaskManager } from "./manager.js";
import { TaskTimeoutError } from "./errors.js";
import { BadRequestError, InternalError } from "../utils/errors.js";
import { createLogger as createStructuredLogger } from "../utils/log/index.js";

// Note: previously used stream/once for generator bridge; no longer required for Promise.all-style group


const log = createStructuredLogger("tasks:scheduler");

/** Default grace period after a watchdog abort before a task is logged as uncooperative. */
const DEFAULT_UNCOOPERATIVE_GRACE_MS = 1000;


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

  /**
   * Test/override hook for the watchdog budget (ms). When set, it takes precedence
   * over the dynamic config. Leave undefined in production to follow `task_timeout_seconds`.
   */
  public taskTimeoutOverrideMs?: number;

  /**
   * Effective per-task time budget in milliseconds (0 = watchdog disabled).
   * Read from the override hook, else the `task_timeout_seconds` dynamic config.
   * Returns 0 when no Config is available (e.g. in unit tests), preserving prior behaviour.
   */
  private get taskTimeoutMs(): number {
    if (typeof this.taskTimeoutOverrideMs === "number") {
      return this.taskTimeoutOverrideMs > 0 ? this.taskTimeoutOverrideMs : 0;
    }
    const seconds = (this._context as Partial<TaskSchedulerContext>).config?.get("task_timeout_seconds");
    return typeof seconds === "number" && seconds > 0 ? seconds * 1000 : 0;
  }

  /**
   * Grace period (ms) between requesting cancellation (watchdog abort) and logging the task as
   * uncooperative. Public/mutable so tests can shorten it. The task is never force-settled.
   */
  public uncooperativeGraceMs: number = DEFAULT_UNCOOPERATIVE_GRACE_MS;

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
      await using logger = createLogger(this.db, task.task_id, { scene_id: task.scene_id, user_id: task.user_id });

      // Watchdog: when a task overruns its budget we *request* cancellation through its abort
      // signal and, after a grace period, loudly log that it is uncooperative. We deliberately
      // never abandon it or force its status: a detached/zombie handler could keep logging or
      // writing. The task keeps its slot and stays "running" until it actually settles — either
      // cooperatively (it observes the signal) or because the DB-level lock / idle-in-transaction
      // timeouts make its next query fail. This trades throughput for safety, by design.
      const timeoutMs = this.taskTimeoutMs;
      const graceMs = this.uncooperativeGraceMs;
      const watchdog = new AbortController();
      let settled = false;
      let budgetTimer: ReturnType<typeof setTimeout> | undefined;
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      if (timeoutMs > 0) {
        budgetTimer = setTimeout(() => {
          if (settled) return;
          logger.warn(`Task exceeded its ${Math.round(timeoutMs / 1000)}s time budget; requesting cancellation`);
          watchdog.abort(new TaskTimeoutError(timeoutMs, task.type, task.task_id));
          graceTimer = setTimeout(() => {
            if (settled) return;
            const msg = `Task ${task.type}#${task.task_id} ignored cancellation for ${Math.round(graceMs / 1000)}s and is still running while holding its slot`;
            logger.error(msg);
            // also surface on stderr: the task's own DB log stream may be part of what is stuck
            console.error(`[tasks] ${msg}`);
          }, graceMs);
          graceTimer.unref?.();
        }, timeoutMs);
        // the watchdog must never keep the process alive on its own
        budgetTimer.unref?.();
      }

      const signals = [queueSignal, taskSignal, timeoutMs > 0 ? watchdog.signal : undefined]
        .filter((s): s is AbortSignal => !!s);
      const context: TaskHandlerContext<TContext> = {
        ...this.taskContext,
        tasks: Object.create(this),
        logger,
        signal: signals.length > 1 ? (AbortSignal as any).any(signals) : signals[0],
      };

      const thisContext: AsyncContext["parent"] = {
        task_id: task.task_id,
        scene_id: task.scene_id,
        user_id: task.user_id,
        logger,
      };

      await this.takeTask(task.task_id);
      try {
        // Awaited normally: the task settles only when the handler does. The watchdog above only
        // requests cancellation and logs — it never resolves/rejects this on the handler's behalf.
        const output = await this.nest({ concurrency: 1, name: `${task.type}#${task.task_id.toString()}`, parent: thisContext }, handler.bind(context), { context, task })
        settled = true;
        await this.releaseTask(task.task_id, output);
        return output;
      } catch (e: any) {
        settled = true;
        //Here we might make an exception if e.name === "AbortError" and the database is closed
        await this.errorTask(task.task_id, e).catch(e => console.error("Failed to set task error : ", e));
        throw e;
      } finally {
        if (budgetTimer) clearTimeout(budgetTimer);
        if (graceTimer) clearTimeout(graceTimer);
      }
    }

    const async_ctx = this.context();
    //Custom name for work to be shown in stack traces
    Object.defineProperty(work, 'name', { value: `TaskScheduler.payload<${task.type}>(${task.task_id})@${async_ctx.queue.name}` });
    if (async_ctx.parent?.logger) {
      async_ctx.parent.logger.debug(`Schedule child task ${task.type}#${task.task_id}`);
    }
    log.debug({ task_id: task.task_id, queue: async_ctx.queue.name }, `Schedule work for task #${task.task_id} on Queue(${async_ctx.queue.name})`);
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
    if (parent) log.debug({ parent_task_id: parent.task_id, scene_id: parent.scene_id, user_id: parent.user_id }, `Inherit values from Parent task #${parent.task_id}`);
    if (!params.scene_id && parent?.scene_id) params.scene_id = parent.scene_id;
    if (!params.user_id && parent?.user_id) params.user_id = parent.user_id;
    if (!params.parent && parent?.task_id) params.parent = parent.task_id;
    return await super.create(params);
  }

  /**
   * Mark every non-terminal task as `error`. Intended to be called once at server
   * startup to clean up tasks left behind by a crashed previous process.
   *
   * Assumes single-instance ownership of the database — any non-terminal row at
   * startup is by definition stranded (no live process holds it).
   *
   * @returns the number of rows that were transitioned to `error`
   */
  async reapOrphans(): Promise<number> {
    const payload = JSON.stringify({
      error: { name: "OrphanError", message: "Orphaned by process restart" }
    });
    const r = await this.db.run(`
      UPDATE tasks
         SET status = 'error',
             output = $1::json
       WHERE status IN ('pending','initializing','running')
    `, [payload]);
    return r.changes ?? 0;
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