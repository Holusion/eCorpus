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

export interface TaskHandlerContext extends TaskSchedulerContext{
  tasks: TaskContextHandlers,
  logger: ITaskLogger,
  signal: AbortSignal,
};


export interface TaskHandlerParams<T extends TaskData=TaskData>{
  task: TaskDefinition<T>;
  inputs: Map<number, any>;
  context: TaskHandlerContext;
}

/**
 * In the future we might want to support tasks that yield sub-tasks using return value `AsyncGenerator<TaskHandler, TReturn, void>`
 */
export type TaskHandler<TData extends TaskData = TaskData, TReturn = any> = (this: TaskHandlerContext, params:TaskHandlerParams<TData>)=> Promise<TReturn>;

/**
 * Bound TaskHandler work package
 */
export type TaskPackage<T extends ( params:TaskHandlerParams<any>)=>Promise<any>> = (params: {signal: AbortSignal})=>ReturnType<T>;

export interface CreateTaskParams<T extends TaskData, U=any>{
  handler: TaskHandler<T,U>;
  data: T;
  scene_id?: number|null;
  user_id?: number|null;
  signal?: AbortSignal;
}


export interface ITaskLogger{
  debug: (message?: any, ...optionalParams: any[]) => void,
  log: (message?: any, ...optionalParams: any[]) => void,
  warn: (message?: any, ...optionalParams: any[]) => void,
  error: (message?: any, ...optionalParams: any[]) => void,
}

export type LogSeverity = keyof ITaskLogger;

export interface TaskContextHandlers{
  create<T extends TaskData, U=any>(p: CreateTaskParams<T, U>): Promise<U>;
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