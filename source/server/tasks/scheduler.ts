
import { debuglog } from "node:util";
import { InternalError, NotFoundError } from "../utils/errors.js";
import { TaskListener, TaskListenerParams } from "./listener.js";
import { ETaskStatus, TaskStatus, TaskType } from "./types.js";
import { on } from "node:events";


const debug = debuglog("tasks:scheduler");

interface ListTasksParams{
  limit?: number;
  offset?: number;
  /**
   * Filter by task status
   * This will probably never return the expected results due to nested tasks having other status than the root task
   * */
  status?: TaskStatus;

  /**
   * Filter tasks created after this date
   */
  after?:Date;
  /** only return tasks for this scene */
  scene_id?: number;
  /** only return tasks created by this user */
  user_id?: number; 
}



export interface TasksTreeNode{
  task_id: number;
  type: TaskType;
  status: TaskStatus;
  groupStatus: TaskStatus;
  after: number[];
  ctime: Date;
  output?:any;
  children: TasksTreeNode[];
}

type StoredTasksTreeNode = Omit<TasksTreeNode, "ctime"|"children"|"groupStatus"|"after">&{
  ctime: string|Date;
  after?:number[];
  children: StoredTasksTreeNode[];
};

export interface RootTasksTreeNode<T = TasksTreeNode> extends Omit<TasksTreeNode,"children"> {
  author: string;
  scene_name: string;
  scene_id: string;
  children: T[];
}

/**
 * Maps nodes as returned from the database to expected structures
 * @param n 
 */
function parseNodes(n:StoredTasksTreeNode):TasksTreeNode
function parseNodes(n:RootTasksTreeNode<StoredTasksTreeNode>):RootTasksTreeNode<TasksTreeNode>
function parseNodes(n:StoredTasksTreeNode|RootTasksTreeNode<StoredTasksTreeNode>){
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


export class TaskScheduler extends TaskListener{

  constructor({client}:TaskListenerParams){
    super({client});
  }

  async start(){
    await super.start(["success", "error"]);
  }

  static _fragTaskTree = `
    t.task_id as task_id,
    scenes.scene_id as scene_id,
    scenes.scene_name as scene_name,
    t.type as type,
    t.status as status,
    t.ctime as ctime,
    users.username as author,
    t.output as output,
    (SELECT json_agg(source ORDER BY source ASC) FROM tasks_relations WHERE target = t.task_id) as after,
    COALESCE(task_tree(t.task_id), '[]'::jsonb) as children
  `

  async getTasks({user_id, scene_id, status, after, offset = 0, limit = 25}: ListTasksParams ={}): Promise<RootTasksTreeNode[]>{
    let args :any[] = [offset, limit];

     return (await this.db.all<RootTasksTreeNode<StoredTasksTreeNode>>(`
      SELECT
        ${TaskScheduler._fragTaskTree}
      FROM
        tasks AS t
        INNER JOIN scenes ON fk_scene_id = scene_id
        INNER JOIN users ON fk_user_id = user_id
      WHERE parent IS NULL 
        ${typeof user_id === "number"? 
          `AND fk_user_id = $${args.push(user_id)}`:""
        }
        ${scene_id? 
          `AND fk_scene_id = $${args.push(scene_id)}`:""
        }
        ${status? 
          `AND t.status = $${args.push(status)}`:""
        }
        ${after?
          `AND  $${args.push(after)} < t.ctime`:""
        }
      ORDER BY ctime DESC, task_id DESC
      OFFSET $1
      LIMIT $2
    `, args)).map<RootTasksTreeNode<TasksTreeNode>>(parseNodes);
  }

  /**
   * Given a task ID, return its task tree
   * Tree has the same shape as what would be returned by {@link getTasks()}
   */
  async getTaskTree(id: number){
     let tasks = (await this.db.all<RootTasksTreeNode<StoredTasksTreeNode>>(`
      SELECT
        ${TaskScheduler._fragTaskTree}
      FROM
        tasks AS t
        INNER JOIN scenes ON fk_scene_id = scene_id
        INNER JOIN users ON fk_user_id = user_id
      WHERE task_id = $1
    `, [id]));
    if(tasks.length ==0) throw new NotFoundError(`No task found with id ${id}`);
    if( 1 < tasks.length) throw new InternalError(`getTaskTree somehow returned more than one task matching ${id}`);
    return tasks.map<RootTasksTreeNode<TasksTreeNode>>(parseNodes)[0];
  }

  /**
   * Given a task ID, walk back to the root (no parent) task, then return its task tree
   * Tree has the same shape as what would be returned by {@link getTasks()}
   */
  async getRootTree(id: number){
     let tasks = (await this.db.all<RootTasksTreeNode<StoredTasksTreeNode>>(`
      WITH RECURSIVE cte_parent_task(id, parent) AS (
        SELECT task_id as id, parent FROM tasks WHERE task_id = $1
        UNION ALL
          SELECT tasks.task_id as id, tasks.parent as parent
          FROM cte_parent_task INNER JOIN tasks ON cte_parent_task.parent = tasks.task_id
      ),
      cte_root_task AS (
        SELECT id
        FROM cte_parent_task
        WHERE  cte_parent_task.parent IS NULL
      )
      SELECT
        ${TaskScheduler._fragTaskTree}
      FROM
        cte_root_task
        INNER JOIN tasks AS t ON id = t.task_id
        INNER JOIN scenes ON fk_scene_id = scene_id
        INNER JOIN users ON fk_user_id = user_id
     
    `, [id]));
    if(tasks.length ==0) throw new NotFoundError(`No task found with id ${id}`);
    if( 1 < tasks.length) throw new InternalError(`getTaskTree somehow returned more than one task matching ${id}`);
    return tasks.map<RootTasksTreeNode<TasksTreeNode>>(parseNodes)[0];
  }


  /**
   * @fixme recursion here is implicit and essentially redundant with the existing (explicit) mechanism of parent/child relationship.
   *  We should probably rely on waiting for every child of a task being finished instead?
   */
  async wait(id: number) :Promise<any>{

    const onResult = async ()=>{
      const t = await this.getTask(id);
      if(t.status == "error"){
        throw await this.resolveTaskError(id);
      }else if(t.status === "success"){
        if(/^\d+$/.test(t.output)){
          debug("recurse over returned task definition #%d", t.output);
          return this.wait(parseInt(t.output));
        }else{
          debug("Return task output for #%d:", id, t.output);
          return t.output;
        }
      }else{
        throw new Error(`Task ${id} is not finished (${t.status})`);
      }
    }
    debug("wait for task #%d", id);
    let it = on(this, "update");
    let task = await this.db.get<{status: TaskStatus, output?:any}> (`SELECT status, output FROM tasks WHERE task_id = $1`, [id]);
    if(!task){
      throw new NotFoundError(`No task found with id ${id}`);
    }
    if(task.status === "error" || task.status === "success"){
      return await onResult();
    }
    for await (let [taskId] of it){
      if(taskId === id) return onResult();
    }
    // @ts-ignore
    return;
  }

  /**
   * Deletes a task from the database
   * Deletion will cascade to any dependents.
   */
  async deleteTask(id: number): Promise<boolean>{
    let r = await this.db.run(`DELETE FROM tasks WHERE task_id = $1`, [id]);
    if(r.changes !== 1) return false;
    return true; 
  }

}
