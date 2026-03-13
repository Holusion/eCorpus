import { NextFunction, Request, Response, Router } from "express";

import wrap from "../../utils/wrapAsync.js";

import { canAdmin, canRead, getLocals, getUser, isCreator, isUser } from "../../utils/locals.js";

import { createUserTask } from "./post.js";
import { putTaskArtifact } from "./task/artifacts/put.js";
import bodyParser from "body-parser";
import { getTaskArtifact } from "./task/artifacts/get.js";
import { getTask } from "./task/get.js";
import { deleteTask } from "./task/delete.js";
import { getTaskTree } from "./task/tree/get.js";
import { UnauthorizedError } from "../../utils/errors.js";
import { AccessType, toAccessLevel } from "../../auth/UserManager.js";

const jsonParser = bodyParser.json();

const router = Router();

router.use("/", isUser);
router.post("/", isCreator, jsonParser, wrap(createUserTask));


function taskAccess(name: AccessType) {
  const minLevel = toAccessLevel(name);
  return function taskAccessMiddleware(req: Request, res: Response, next: NextFunction) {
    const {
      vfs,
      taskScheduler,
      userManager,
    } = getLocals(req);
    const requester = getUser(req)!;
    if (!requester) return next(new UnauthorizedError(`Route requires a valid user`));

    const { id: idString } = req.params;
    const id = parseInt(idString);
    taskScheduler.getTask(id).then(async (task) => {
      if (requester.level == "admin") return next(); //Even if requester is admin, check for task existence
      else if (task.user_id && task.user_id == requester.uid) return next();
      else if (!task.scene_id || toAccessLevel(await userManager.getAccessRights(task.scene_id, requester.uid)) < minLevel) {
        return next(new UnauthorizedError(`Administrative rights are required to delete tasks`))
      } else {
        return next();
      }
    }).catch(next);
  }
}


router.get("/:id(\\d+)", isUser, wrap(getTask));
router.get("/:id(\\d+)/tree", taskAccess("read"), wrap(getTaskTree));
router.delete("/:id(\\d+)", taskAccess("admin"), wrap(deleteTask));
router.put("/:id(\\d+)/artifact", taskAccess("admin"), wrap(putTaskArtifact));
router.get("/:id(\\d+)/artifact", taskAccess("read"), wrap(getTaskArtifact));

export default router;
