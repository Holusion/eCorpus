import { Request, Response } from "express";
import { getLocals } from "../../../utils/locals.js";
import { BadRequestError, NotFoundError } from "../../../utils/errors.js";
import { RootTasksTreeNode, TasksTreeNode } from "../../../tasks/scheduler.js";
import { queryToPage } from "../../../utils/query.js";



type TasksTreeNodeDescription = Pick<TasksTreeNode, "task_id"|"type"|"status">&{
  children: TasksTreeNodeDescription[];
};

export function formatTaskTree(node: TasksTreeNodeDescription):string[]{
  return [
    `├─ #${node.task_id} ${node.type} (${node.status})`,
    ...node.children.map(c=>formatTaskTree(c).map(s=>`│  ${s}`))
   ].flat(1);
}

export function groupTaskTree(nodes:RootTasksTreeNode[]){
  let scenes = new Map<string, RootTasksTreeNode[]>();
  for(let node of nodes){
    if(!scenes.get(node.scene_name)?.push(node)){
      scenes.set(node.scene_name,[node]);
    }
  }
  return scenes;
}


export async function getSceneTasks(req: Request, res: Response){
  let {scene} = req.params;
  let {taskScheduler, vfs} = getLocals(req);


  let {id: scene_id, name} = await vfs.getScene(scene);
  let params = {scene_id, ...queryToPage(req.query)};

  let tree = await taskScheduler.getTasks(params);


  res.format({
    "application/json": ()=>{
      res.status(200).send(tree);
    },
    "text/plain": ()=>{
      let txt = `${name}\n`;
      for(let rootTask of tree){
        txt+= formatTaskTree(rootTask).join("\n") ;
      }
      res.status(200).set("Content-Type", "text/plain; encoding=utf-8").send(txt);
    }
  });
}