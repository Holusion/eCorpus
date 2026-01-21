import { NotFoundError } from "../utils/errors.js";
import { parseTaskError } from "./errors.js";
import { TaskType, TaskStatus, ETaskStatus } from "./types.js";

export interface TasksTreeNode{
  /** This task's unique identifier*/
  task_id: number;
  /** This task's type */
  type: TaskType;
  /** This task's status */
  status: TaskStatus;
  /**
   * Reduces the task group (this task and all its children) to its lowest status, by order of precedence.
   * It means it will be an error if the task or any of its dependencies has an error.
   * 
   * @deprecated This is (quite confusingly) different from the task dependency chain status and should generally be ignored
   * 
   * @see {@link ETaskStatus} for ordering
   */
  groupStatus: TaskStatus;
  after: number[];
  ctime: Date;
  output?:any;
  children: TasksTreeNode[];
}

/**
 * Task Tree as stored in the database. It needs to be reduced through {@link parseNodes} to be of any use
 */
export type StoredTasksTreeNode = Omit<TasksTreeNode, "ctime"|"children"|"groupStatus"|"after">&{
  ctime: string|Date;
  after?:number[];
  children: StoredTasksTreeNode[];
};

export interface RootTasksTreeNode<T = TasksTreeNode> extends Omit<TasksTreeNode,"children"> {
  author: string|null;
  scene_name: string|null;
  scene_id: string|null;
  children: T[];
}

/**
 * Maps nodes as returned from the database to expected structures
 * @param n 
 */
export function parseNodes(n:StoredTasksTreeNode):TasksTreeNode
export function parseNodes(n:RootTasksTreeNode<StoredTasksTreeNode>):RootTasksTreeNode<TasksTreeNode>
export function parseNodes(n:StoredTasksTreeNode|RootTasksTreeNode<StoredTasksTreeNode>){
  const children = n.children.map(n=>parseNodes(n));
  let statusCode = children.reduce((status, c)=> Math.min(status, ETaskStatus[c.groupStatus]),  ETaskStatus[n.status]);
  let groupStatus = ETaskStatus[statusCode] as TaskStatus;
  return {
    ...n, 
    after: n.after??[],
    ctime: new Date(n.ctime),
    groupStatus,
    children
  } satisfies TasksTreeNode;
}

export function traverseNode(node: TasksTreeNode, cb: (node: TasksTreeNode)=>void){
  for(let child of node.children){
    traverseNode(child, cb);
  }
  cb(node);
}

export function findNode(tree: TasksTreeNode, id: number):TasksTreeNode|undefined{
  if(tree.task_id === id) return tree;
  for(let child of tree.children){
    let node = findNode(child, id);
    if(node) return node;
  }
}

/**
 * Extract error(s) from a task tree whose groupStatus is `error`.
 */
export function getGroupError(tree:TasksTreeNode):Error{
  if(tree.status === "error") return parseTaskError(tree.output);
  let error:Error;
  traverseNode(tree, (node)=>{
    if(node.status === "error") error ??= parseTaskError(node.output);
  });
  return error! ?? new Error(`Task Tree errors not found`);
}

/**
 * Returns a list of dependant tasks
 * @param tree 
 * @returns 
 */
export function getTaskDependencies(tree: TasksTreeNode, id: number = tree.task_id): number[]{
  const ids = new Set<number>();
  const node = findNode(tree, id);
  if(!node) throw new NotFoundError(`Node ${id} is not connected to the task tree`);
  for(let dep of node.after){
    ids.add(dep);
    for(let v of getTaskDependencies(tree, dep)){
      ids.add(v);
    }
  }
  return Array.from(ids);
}

