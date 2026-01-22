import type UserManager from "../auth/UserManager.js";
import { Config } from "../utils/config.js";
import { TDerivativeQuality } from "../utils/schema/model.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import type Vfs from "../vfs/index.js";


export type TaskData = Record<string, any>;

export type TaskStatus = 'initializing'|'pending'|'aborting'|'running'|'success'|'error';
export enum ETaskStatus{
  'aborting' = -2,
  'error' = -1,
  'initializing',
  'running',
  'pending',
  'success',
}

export interface TaskDefinition<T extends TaskData = TaskData>{
  fk_scene_id: number;
  fk_user_id: number;
  task_id: number;
  ctime: Date;
  type :string;
  parent: number|null;
  /** **Unordered** list of task requirements */
  after: number[];
  data: T;
  output: any;
  status: TaskStatus;
}


export interface TaskSchedulerContext{
  vfs: Vfs,
  db: DatabaseHandle,
  userManager: UserManager,
  config: Config,
}

export type TaskHandlerContext<T = TaskSchedulerContext> = T & {
  tasks: TaskContextHandlers,
  logger: ITaskLogger,
  signal: AbortSignal,
};


export interface TaskHandlerParams<TData extends TaskData=TaskData, TContext = TaskSchedulerContext>{
  task: TaskDefinition<TData>;
  inputs: Map<number, any>;
  context: TaskHandlerContext<TContext>;
}

/**
 * In the future we might want to support tasks that yield sub-tasks using return value `AsyncGenerator<TaskHandler, TReturn, void>`
 */
export type TaskHandler<TData extends TaskData = TaskData, TReturn = any, TContext = TaskSchedulerContext> = (this: TaskHandlerContext<TContext>, params:TaskHandlerParams<TData, TContext>)=> Promise<TReturn>;

/**
 * Bound TaskHandler work package
 */
export type TaskPackage<T = any> = (params: {signal: AbortSignal})=>Promise<T>;

export interface CreateTaskParams<T extends TaskData>{
  data: T;
  type: string;
  scene_id?: number|null;
  user_id?: number|null;
  status?: TaskStatus;
}

export interface CreateRunTaskParams<TData extends TaskData, TReturn=any, TContext = TaskSchedulerContext> extends Omit<CreateTaskParams<TData>, "type">{
  handler: TaskHandler<TData,TReturn, TContext>;
  type?:string;
  signal?: AbortSignal;
  /** Can't create an immediately-running task with a status other than pending */
  status?:"pending";
}

export interface RunTaskParams<TData extends TaskData, TReturn=any, TContext = TaskSchedulerContext>{
  task: TaskDefinition<TData>;
  handler: TaskHandler<TData, TReturn, TContext>;
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

export interface TaskContextHandlers{
  create<T extends TaskData, U=any>(p: CreateRunTaskParams<T, U>): Promise<U>;
  getTask<T extends TaskData = TaskData>(id: number):Promise<TaskDefinition<T>>;
  /**
   * Creates a group and encapsulates any task N° returned from the inner function as a dependency of this group.
   * The group's output is an array of all its dependencies outputs.
   * @param cb 
   */
  group(cb: (context: TaskContextHandlers)=>Promise<number[]>|AsyncGenerator<number,void,unknown>, remap?: any) :Promise<number>;
}


export type GroupCallback = (context: TaskContextHandlers)=>Promise<number[]>|AsyncGenerator<number,void,unknown>;


export interface TaskHandlerDefinition<T extends TaskData = TaskData>{
  readonly type: string;
  handle: TaskHandler<T>;
};


export interface ProcessFileParams{
  file?:string;
  preset: TDerivativeQuality;
}

export function requireFileInput(inputs:Map<number, any>){
  let file:string|undefined = undefined;
  for(let input of inputs.values()){
    if(file){
      throw new Error("More than one input could be used as input file");
    }
    if(typeof input === "string") file = input;
  }
  if(!file){
    throw new Error(`No input file provided and none was found in task inputs\n${JSON.stringify([...inputs.entries()], null, 2)}`);
  }
  return file;
}


export interface ImportSceneResult{
  name: string;
  action: "create"|"update"|"error";
  error?: string;
}