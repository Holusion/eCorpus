import type UserManager from "../auth/UserManager.js";
import { Config } from "../utils/config.js";
import { TDerivativeQuality } from "../utils/schema/model.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import type Vfs from "../vfs/index.js";

import type * as tasks from "./handlers/index.js";

export type TaskData =Record<string, any>|void;

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
  task_id: number;
  ctime: Date;
  type :TaskType;
  parent: number|null;
  /** **Unordered** list of task requirements */
  after: number[];
  data: T;
  output: any;
  status: TaskStatus;
}



export interface CreateTaskParams<T extends TaskType>{
  type: T;
  data: TaskTypeData<T>;
  parent?: number|null;
  after?: number[]|null;
  status?: TaskStatus;
}


export interface TaskLogger{
  debug: (message?: any, ...optionalParams: any[]) => void,
  log: (message?: any, ...optionalParams: any[]) => void,
  warn: (message?: any, ...optionalParams: any[]) => void,
  error: (message?: any, ...optionalParams: any[]) => void,
}

export interface TaskContextHandlers{
  create<T extends TaskType>(p: CreateTaskParams<T> ): Promise<number>;
  getTask<T extends TaskType =any>(id: number):Promise<TaskDefinition<TaskTypeData<T>>>;
  /**
   * Creates a group and encapsulates any task N° returned from the inner function as a dependency of this group.
   * The group's output is an array of all its dependencies outputs.
   * @param cb 
   */
  group(cb: (context: TaskContextHandlers)=>Promise<number[]>|AsyncGenerator<number,void,unknown>, remap?: any) :Promise<number>;
}

export interface TaskHandlerContext{
  vfs: Vfs,
  db: Omit<DatabaseHandle,"beginTransaction">,
  userManager: UserManager,
  tasks: TaskContextHandlers,
  logger: TaskLogger,
  signal: AbortSignal,
  config: Config,
};

export type GroupCallback = (context: TaskContextHandlers)=>Promise<number[]>|AsyncGenerator<number,void,unknown>;

export interface TaskHandlerParams<T extends TaskData>{
  task: TaskDefinition<T>;
  context: TaskHandlerContext;
  inputs: Map<number, any>;
}

export type TaskHandler<T extends TaskData = TaskData, U = any> = (params:TaskHandlerParams<T>)=>Promise<U>;

export type TaskType =  keyof typeof tasks;
export type TaskTypeData<T extends TaskType> = Parameters<(typeof tasks[T])>[0]["task"]["data"];

export interface TaskHandlerDefinition<T extends TaskData = TaskData>{
  readonly type: string;
  handle:TaskHandler<T>;
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