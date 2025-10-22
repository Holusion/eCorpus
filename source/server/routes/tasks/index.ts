import { Router } from "express";

import wrap from "../../utils/wrapAsync.js";

import { canAdmin, canRead, isUser } from "../../utils/locals.js";
import { getOwnTasks, getSceneTasks } from "./get.js";
import { deleteTask } from "./delete.js";

const router = Router();

router.use("/", isUser);

router.get("/own", isUser, wrap(getOwnTasks));

router.get("/scene/:scene", isUser, canRead, wrap(getSceneTasks));

// the :scene parameter seems unnecessary
// However it makes rights management easier because we can use the generic `canAdmin` middleware
router.delete("/scene/:scene/:id", canAdmin, wrap(deleteTask));

export default router;
