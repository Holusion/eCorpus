
import { TaskListener, TaskListenerParams } from "./listener.js";
import { TaskStatus, TaskType } from "./types.js";

interface ListTasksParams{
  limit?: number;
  offset?: number;
}

export interface TasksTreeNode{
  task_id: number;
  type: TaskType;
  status: TaskStatus;
  ctime: Date;
  children: TasksTreeNode[];
}

export interface SceneTasksTree {
  scene_id: number;
  scene_name: string;
  tasks:TasksTreeNode[];
}


export class TaskScheduler extends TaskListener{

  constructor({client}:TaskListenerParams){
    super({client});
  }

  async start(){
    await super.start(["success", "error"]);
  }

  async listAllTasks({offset = 0, limit = 25}: ListTasksParams ={}): Promise<SceneTasksTree[]>{
     return await this.db.all<SceneTasksTree>(`
      SELECT
        scene_id,
        scene_name,
        jsonb_agg(jsonb_build_object(
          'task_id', t.task_id,
          'type', t.type,
          'status', t.status,
          'ctime', t.ctime,
          'children', task_tree(t.task_id)
        )) AS tasks
      FROM
        tasks AS t
        INNER JOIN scenes ON fk_scene_id = scene_id
       WHERE parent IS NULL 
      GROUP BY scene_name, scene_id
      OFFSET $1
      LIMIT $2
    `, [offset, limit]);
  }

  async listOwnTasks({user_id, offset = 0, limit = 25}: ListTasksParams&{user_id: number}): Promise<SceneTasksTree[]>{
    return await this.db.all<SceneTasksTree>(`
      SELECT
        scene_id,
        scene_name, 
        jsonb_agg(jsonb_build_object(
          'task_id', t.task_id,
          'type', t.type,
          'status', t.status,
          'ctime', t.ctime,
          'children', task_tree(t.task_id)
        )) AS tasks
      FROM
        tasks AS t
        INNER JOIN scenes ON fk_scene_id = scene_id
       WHERE parent IS NULL 
          AND fk_user_id = $1
      GROUP BY scene_name, scene_id
      OFFSET $2
      LIMIT $3
    `, [user_id, offset, limit]);
  }

  async listSceneTasks({scene_id, offset, limit}: ListTasksParams&{scene_id: number}): Promise<SceneTasksTree[]>{
    return await this.db.all<SceneTasksTree>(`
      SELECT
        scene_id,
        scene_name, 
        jsonb_agg(jsonb_build_object(
          'task_id', t.task_id,
          'type', t.type,
          'status', t.status,
          'ctime', t.ctime,
          'children', task_tree(t.task_id)
        )) AS tasks
      FROM
        tasks AS t
        INNER JOIN scenes ON fk_scene_id = scene_id
       WHERE parent IS NULL 
          AND fk_scene_id = $1
      GROUP BY scene_name, scene_id
      OFFSET $2
      LIMIT $3
    `, [scene_id, offset, limit]);
  }
}

/*
      WITH RECURSIVE cte_requester AS (
        SELECT 
        user_id,
        level,
        (
          SELECT array_agg(fk_group_id) AS ids
          FROM groups_membership
          WHERE fk_user_id = user_id
        ) AS groups
        FROM users
        WHERE user_id = '216199665534191'::bigint
      ),
      cte_tasks_tree(fk_scene_id,task_id, type, parent) AS (
        SELECT -- select root tasks
          fk_scene_id,
          task_id,
          type,
          parent
        FROM 
          tasks 
          LEFT JOIN users_acl USING(fk_scene_id)
          LEFT JOIN groups_acl USING(fk_scene_id)
          CROSS JOIN cte_requester
          INNER JOIN scenes ON tasks.fk_scene_id = scenes.scene_id
        WHERE parent IS NULL 
          AND (
            users_acl.fk_user_id = cte_requester.user_id
          )
        UNION ALL (
          SELECT 
            tasks.fk_scene_id,
            tasks.task_id,
            tasks.type,
            tasks.parent
          FROM 
            tasks,
            cte_tasks_tree
          WHERE
            tasks.parent = cte_tasks_tree.task_id
        )
      )
      SELECT
        scene_name, 
        cte_tasks_tree.* FROM cte_tasks_tree INNER JOIN scenes ON fk_scene_id = scene_id;
      ;
*/




/*
      WITH cte_requester AS (
        SELECT 
        user_id,
        level,
        (
          SELECT array_agg(fk_group_id) AS ids
          FROM groups_membership
          WHERE fk_user_id = user_id
        ) AS groups
        FROM users
        WHERE user_id = $1
      )
      SELECT 
        scenes.scene_id AS scene_id,
        scenes.scene_name AS scene_name,
        array_agg(json_build_object(
          'id', tasks.task_id,
          'type', tasks.type,
          'status', tasks.status,
          'ctime', tasks.ctime
        )) AS tasks
      FROM
        tasks
        LEFT JOIN users_acl USING(fk_scene_id)
        LEFT JOIN groups_acl USING(fk_scene_id)
        CROSS JOIN cte_requester
        INNER JOIN scenes ON tasks.fk_scene_id = scenes.scene_id
      WHERE 
        tasks.parent IS NULL
        AND (
          cte_requester.level = 3
          OR users_acl.fk_user_id = cte_requester.user_id
          OR groups_acl.fk_group_id = ANY(cte_requester.groups)
        )
      GROUP BY scenes.scene_id, scenes.scene_name
      ORDER BY tasks.ctime desc
      OFFSET $2
      LIMIT $3
*/