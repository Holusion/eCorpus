export interface TaskData{
  inputs?: Record<string, string>;
  outputs?: Record<string, string>;
  params?: Record<string, string|number|boolean>;
}

export type TaskStatus = 'pending'|'aborting'|'running'|'success'|'error';

export interface TaskDefinition{
  fk_scene_id: number;
  task_id: number;
  ctime: Date;
  type :string;
  parent: number|null;
  data: TaskData;
  status: TaskStatus;
}

export interface ResolvedTaskDefinition extends Omit<TaskDefinition, "parent">{
  parent: TaskDefinition|null;
}

export interface TaskHandlerParams{
  task: ResolvedTaskDefinition;
  logger: unknown;
  signal: AbortSignal;
}

export type TaskHandler = (params:TaskHandlerParams)=>Promise<string|void>;
