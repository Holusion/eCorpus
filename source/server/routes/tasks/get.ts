import { Request, Response } from "express";
import { getLocals, getUserId } from "../../utils/locals.js";
import { ForbiddenError } from "../../utils/errors.js";
import { TasksTreeNode } from "../../tasks/scheduler.js";



export function formatTaskTree(node: TasksTreeNode):string[]{
  return [
    `├─ #${node.task_id} ${node.type} (${node.status})`,
    ...node.children.map(c=>formatTaskTree(c).map(s=>`│  ${s}`))
   ].flat(1);
}

export async function getOwnTasks(req: Request, res: Response){
  let user_id = getUserId(req); 
  let {taskScheduler} = getLocals(req);

  if(!user_id) throw new ForbiddenError(`Requires valid authentication`);

  let params = {user_id, offset: 0, limit: 25};

  if(typeof req.query.offset === "string" && Number.isInteger(parseInt(req.query.offset))){
    params.offset = parseInt(req.query.offset);
  }
  if(typeof req.query.limit === "string" && Number.isInteger(parseInt(req.query.limit))){
    params.limit = parseInt(req.query.limit);
  }

  let list = await taskScheduler.listOwnTasks(params);

  res.format({
    "application/json": ()=>{
      res.status(200).send(list);
    },
    "text/plain": ()=>{
      let txt = "";
      for(let scene of list){
        txt += `${scene.scene_name}(id: #${scene.scene_id})\n`
        for(let rootTask of scene.tasks){
          txt+= formatTaskTree(rootTask).join("\n") ;
        }
        if(scene.tasks.length) txt += "\n";
      }
      res.status(200).set("Content-Type", "text/plain; encoding=utf-8").send(txt);
    }
  })
}