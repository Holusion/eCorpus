import type UserManager from "../auth/UserManager.js";
import { Config } from "../utils/config.js";
import { TDerivativeQuality } from "../utils/schema/model.js";
import { RootRelativePath } from "../vfs/Base.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import type Vfs from "../vfs/index.js";
import { TaskScheduler } from "./scheduler.js";


export type TaskData = Record<string, any>
export type TaskDataPayload = undefined|TaskData;

export type TaskStatus = 'initializing'|'pending'|'aborting'|'running'|'success'|'error';
export enum ETaskStatus{
  'aborting' = -2,
  'error' = -1,
  'initializing',
  'running',
  'pending',
  'success',
}



/** 
 * Task Creation parameters
 */
export interface TaskDefinition<TData extends TaskDataPayload = TaskDataPayload, TReturn = any>{
  scene_id: number;
  user_id: number;
  task_id: number;
  ctime: Date;
  type :string;
  parent: number|null;
  /** **Unordered** list of task requirements */
  after: number[];
  data: TData extends undefined? {}: TData;
  output: TReturn;
  status: TaskStatus;
};



export interface TaskSchedulerContext{
  vfs: Vfs,
  db: DatabaseHandle,
  userManager: UserManager,
  config: Config,
}

export type TaskHandlerContext<T = TaskSchedulerContext> = T & {
  tasks: TaskScheduler,
  logger: ITaskLogger,
  signal: AbortSignal,
};

/**
 * Parameters passed to a task handler when it is invoked
 */
export interface TaskHandlerParams<TData extends TaskDataPayload = TaskDataPayload, TContext = TaskSchedulerContext>{
  task: TaskDefinition<TData>;
  context: TaskHandlerContext<TContext>;
}

/**
 * In the future we might want to support tasks that yield sub-tasks using return value `AsyncGenerator<TaskHandler, TReturn, void>`
 */
export type TaskHandler<TData extends TaskDataPayload = TaskDataPayload, TReturn = any, TContext = TaskSchedulerContext> = (this: TaskHandlerContext<TContext>, params:TaskHandlerParams<TData, TContext>)=> TReturn|Promise<TReturn>;

/**
 * Bound TaskHandler work package
 */
export type TaskPackage<T = any> = (params: {signal: AbortSignal})=>Promise<T>;


type TaskDataRequirement<T extends TaskDataPayload> = T extends undefined 
  ? { data?: never } 
  : { data: T };


type TaskCreateCommonParameters = {
  scene_id?: number|null;
  user_id?: number|null;
  parent?: number|null;
}

export interface RunOptions{
  signal?:AbortSignal;
  immediate?:boolean;
}


/**
 * Parameters to create a task
 */
export type CreateTaskParams<TData extends TaskDataPayload> = TaskCreateCommonParameters &{
  type: string;
  status?: TaskStatus;
  data: TData;
};


export type CreateRunTaskParams<TData extends TaskDataPayload, TReturn=any, TContext = TaskSchedulerContext> =
 TaskCreateCommonParameters & TaskDataRequirement<TData> & {
  handler: TaskHandler<TData, TReturn, TContext>;
  type?: string;
  status?:"pending";
  immediate?: boolean;
  signal?: AbortSignal;
  /** Can't create an immediately-running task with a status other than pending */
};

/**
 * Run a task that was previously created
 */
export interface RunTaskParams<TData extends TaskDataPayload, TReturn=any, TContext = TaskSchedulerContext>{
  task: TaskDefinition<TData>;
  handler: TaskHandler<TData, TReturn, TContext>;
  immediate?: boolean;
  signal?: AbortSignal;
}

export interface TaskSettledCallback<T> {
  (err:null, value:T):unknown
  (err:any):unknown
}

export interface ITaskLogger{
  debug: (message?: any, ...optionalParams: any[]) => void,
  log: (message?: any, ...optionalParams: any[]) => void,
  warn: (message?: any, ...optionalParams: any[]) => void,
  error: (message?: any, ...optionalParams: any[]) => void,
}

export type LogSeverity = keyof ITaskLogger;

/**
 * A single log line produced by a task
 */
export interface TaskLogEntry{
  log_id: number;
  task_id: number;
  timestamp: Date;
  severity: LogSeverity;
  message: string;
}

/**
 * A task node in the tree, carrying its direct children.
 * The `parent` field allows reconstructing the graph from a flat list if needed.
 */
export interface TaskNode<TData extends TaskDataPayload = TaskDataPayload, TReturn = any>
  extends TaskDefinition<TData, TReturn> {
  children: TaskNode<TData, TReturn>[];
}

/**
 * Task list item returned by `getTasks()` in summary views.
 *
 * Includes nullable `scene` and `owner` fields which map to the referenced
 * `scenes.scene_name` and `users.username` respectively. These fields may be
 * `null` when the task has no linked scene or user.
 */
export interface TaskListItem<TData extends TaskDataPayload = TaskDataPayload, TReturn = any>
  extends TaskDefinition<TData, TReturn> {
  scene: string | null;
  owner: string | null;
}

/**
 * Result returned by {@link TaskManager.getTaskTree}.
 *
 * - `root` is the requested task as a {@link TaskNode}; its `children` array
 *   contains the direct children, each of which recursively carries their own
 *   `children`, forming a proper tree.  The `parent` field on every node is
 *   preserved so the tree can also be flattened back to a list if needed.
 * - `logs` is a **flat, ordered array** of every log line produced by any task in
 *   the tree, sorted by `log_id ASC` (i.e. insertion order).
 */
export interface TaskTreeResult<TData extends TaskDataPayload = TaskDataPayload, TReturn = any>{
  /** The requested task, with descendants nested under `children` recursively */
  root: TaskNode<TData, TReturn>;
  /** All log lines from every task in the tree, ordered by log_id ASC */
  logs: TaskLogEntry[];
}

export interface TaskHandlerDefinition<T extends TaskDataPayload = TaskDataPayload>{
  readonly type: string;
  handle: TaskHandler<T>;
};


// Common task data types
export interface FileArtifact extends TaskData{
  fileLocation: RootRelativePath
}

export function isArtifactTask(output:TaskData):output is FileArtifact{
  return typeof output?.fileLocation == "string";
}



export interface ProcessFileParams extends FileArtifact{
  preset: TDerivativeQuality;
}
