import { Router } from "express";

import wrap from "../../utils/wrapAsync.js";

import { isUser } from "../../utils/locals.js";
import { getOwnTasks } from "./get.js";

const router = Router();

router.use("/", isUser);

router.get("/own", isUser, wrap(getOwnTasks));

export default router;
