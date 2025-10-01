import type UserManager from "../auth/UserManager.js";
import type Vfs from "../vfs/index.js";


export interface TaskData{
  inputs?: Record<string, string|number|boolean>;
  outputs?: Record<string, string|number|boolean>;
  params?: Record<string, string|number|boolean>;
}

export type TaskStatus = 'pending'|'aborting'|'running'|'success'|'error';

export interface TaskDefinition<T extends TaskData = TaskData>{
  fk_scene_id: number;
  task_id: number;
  ctime: Date;
  type :string;
  parent: number|null;
  data: T;
  status: TaskStatus;
}

export interface ResolvedTaskDefinition<T extends TaskData = TaskData> extends Omit<TaskDefinition<T>, "parent">{
  parent: TaskDefinition<TaskData>|null;
}

export interface TaskLogger{
  debug: (message?: any, ...optionalParams: any[]) => void,
  log: (message?: any, ...optionalParams: any[]) => void,
  warn: (message?: any, ...optionalParams: any[]) => void,
  error: (message?: any, ...optionalParams: any[]) => void,
}
export interface TaskHandlerContext{
  vfs: Vfs,
  userManager: UserManager,
};

export interface TaskHandlerParams<T extends TaskData>{
  task: ResolvedTaskDefinition<T>;
  logger: TaskLogger;
  signal: AbortSignal;
  context: TaskHandlerContext;
}

export type TaskHandler<T extends TaskData = TaskData> = (params:TaskHandlerParams<T>)=>Promise<string|void>;
export type TaskHandlerDefinition<T extends TaskData = TaskData> = {readonly type: string , handle:TaskHandler<T>};