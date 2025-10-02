import type UserManager from "../auth/UserManager.js";
import type Vfs from "../vfs/index.js";

import type * as tasks from "./handlers/index.js";
import { TaskListener } from "./listener.js";

export type TaskData =Record<string, any>;

export type TaskStatus = 'pending'|'aborting'|'running'|'success'|'error';

export interface TaskDefinition<T extends TaskData = TaskData>{
  fk_scene_id: number;
  task_id: number;
  ctime: Date;
  type :TaskType;
  after: number|null;
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
  tasks: Pick<TaskListener,"create"|"wait">,
};

export interface TaskHandlerParams<T extends TaskData>{
  task: ResolvedTaskDefinition<T>;
  logger: TaskLogger;
  signal: AbortSignal;
  context: TaskHandlerContext;
}

export type TaskHandler<T extends TaskData = TaskData> = (params:TaskHandlerParams<T>)=>Promise<string|void>;

export type TaskType =  keyof typeof tasks;
export type TaskTypeData<T extends TaskType> = Parameters<(typeof tasks[T])>[0]["task"]["data"];

export interface TaskHandlerDefinition<T extends TaskData = TaskData>{
  readonly type: string;
  handle:TaskHandler<T>;
};