
import { debuglog } from "node:util";
import { InternalError, NotFoundError } from "../utils/errors.js";
import { TaskListener, TaskListenerParams } from "./listener.js";
import { TaskStatus } from "./types.js";
import { on } from "node:events";
import { isTimeInterval } from "../utils/format.js";
import { RootTasksTreeNode, TasksTreeNode, parseNodes, getTaskDependencies, getGroupError, StoredTasksTreeNode, findNode } from "./tree.js";
import { parseTaskError } from "./errors.js";


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
   * Filter tasks created after this date. Supports ISO 8601 "period" format
   */
  after?:Date|string;
  /** only return tasks for this scene */
  scene_id?: number;
  /** only return tasks created by this user */
  user_id?: number; 
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

    const is_period = isTimeInterval(after);

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
          `AND ${is_period?`CURRENT_TIMESTAMP - $${args.push(after)}::interval`: `$${args.push(after)}`}  < t.ctime`:""
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
  async getTaskTree(id: number): Promise<RootTasksTreeNode<TasksTreeNode>>{
     let tasks = await this.db.all<RootTasksTreeNode<StoredTasksTreeNode>>(`
      SELECT
        ${TaskScheduler._fragTaskTree}
      FROM
        tasks AS t
        LEFT JOIN scenes ON fk_scene_id = scene_id
        LEFT JOIN users ON fk_user_id = user_id
      WHERE task_id = $1
    `, [id]);
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
        LEFT JOIN scenes ON fk_scene_id = scene_id
        LEFT JOIN users ON fk_user_id = user_id
     
    `, [id]));
    if(tasks.length ==0) throw new NotFoundError(`No task found with id ${id}`);
    if( 1 < tasks.length) throw new InternalError(`getTaskTree somehow returned more than one task matching ${id}`);
    return tasks.map<RootTasksTreeNode<TasksTreeNode>>(parseNodes)[0];
  }

  /**
   * Iterate over a task's tree updates until stopped
   * @param id The task ID to monitor
   * @param timeout Optional time limit to wait before aborting
   */
  async *getTreeState(id: number, {timeout}: {timeout?:number} ={}): AsyncGenerator<TasksTreeNode, void, void>{
    debug("Get tree state for "+ id);
    const c = new AbortController();
    if(timeout) setTimeout(c.abort, timeout);
    try{
      let it = on(this, "update", {signal: c.signal});
      let tree = await this.getRootTree(id);
      yield tree;
      if(c.signal.aborted) return;
      let ids = getTaskDependencies(tree);
      for await (let [changed_id] of it){
        if(changed_id !== id && ids.indexOf(changed_id) == -1) continue;
        tree = await this.getRootTree(id);
        yield tree;
        ids = getTaskDependencies(tree);
      }
    }finally{
      c.abort();
    }
  }

  /**
   * Waits for a task to complete and returns its output.
   * 
   * If the task or any of its inputs fails, this will be rejected.
   * 
   * @use {@link waitGroup} to wait for a task group to finish
   * @returns the task's output, resolved recursively if output was a dependant task's id
   */
  async wait(id: number) :Promise<any>{
    debug(`wait for task #${id} to resolve`);
    for await (let tree of this.getTreeState(id)){
      const node = findNode(tree, id);
      if(!node){
        throw new Error(`Couldn't find node ${id} (child of #${tree.task_id})`);
      }
      if(node.status == "error"){
        debug("Throw task error");
        throw parseTaskError(node.output);
      }else if(node.status === "success"){
        if(/^\d+$/.test(node.output)){
          debug("recurse over returned task definition #%d", node.output);
          return await this.wait(parseInt(node.output));
        }else{
          debug("Return task output for #%d:", id, node.output);
          return node.output;
        }
      }else if(node.status === "pending"){
        debug("Node is pending. Checks dependencies");
        //Check if any dependency has failed
        for(let dep of getTaskDependencies(tree, id)){
          const depNode = findNode(tree, dep);
          if(!depNode) throw new Error(`Couldn't find node ${id} (child of #${tree.task_id})`);
          if(depNode.status === "error"){
            debug("Throw child error");
            throw parseTaskError(depNode.output);
          }
        }
      }
    }
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
