import { Router } from "express";

import wrap from "../../utils/wrapAsync.js";

import { canRead, isUser } from "../../utils/locals.js";
import { getOwnTasks, getSceneTasks } from "./get.js";

const router = Router();

router.use("/", isUser);

router.get("/own", isUser, wrap(getOwnTasks));
router.get("/scene/:scene", isUser, canRead, wrap(getSceneTasks));

export default router;
