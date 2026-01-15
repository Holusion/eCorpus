import { Request, Response } from "express";
import { ForbiddenError } from "../../../utils/errors.js";
import { getUserId, getLocals } from "../../../utils/locals.js";
import { queryToPage } from "../../../utils/query.js";
import { groupTaskTree, formatTaskTree } from "../scenes/get.js";


export async function getOwnTasks(req: Request, res: Response) {
  let user_id = getUserId(req);
  let { taskScheduler } = getLocals(req);

  if (!user_id) throw new ForbiddenError(`Requires valid authentication`);

  let params = { user_id, ...queryToPage(req.query) };

  let list = await taskScheduler.getTasks(params);

  res.format({
    "application/json": () => {
      res.status(200).send(list);
    },
    "text/plain": () => {
      let txt = "";
      const scenes = groupTaskTree(list);
      for (let [scene, tasks] of scenes) {
        txt += `${scene}\n`;
        for (let rootTask of tasks) {
          txt += formatTaskTree(rootTask).join("\n");
        }
      }

      res.status(200).set("Content-Type", "text/plain; encoding=utf-8").send(txt);
    }
  });
}
