import { Router } from "express";

import { numericParam, policy } from "../../utils/locals.js";

import { requireEvents, streamAllTasks, streamSceneTasks, streamUserTasks } from "./stream.js";

const router = Router();

router.use(requireEvents);

//Watching all tasks is for instance administration, like /admin/stats. Watching a user's is
//for that user or an admin, and watching a scene's is for those who can work on it: most
//scenes can be read by anyone, which shouldn't be enough to observe the activity on them.
router.get("/", policy({ scope: "instance:read" }), streamAllTasks);
router.get("/users/:uid", numericParam("uid"), policy({ scope: "tasks:read", access: "write", on: "user" }), streamUserTasks);
router.get("/scenes/:scene", policy({ scope: "tasks:read", access: "write", on: "scene" }), streamSceneTasks);

export default router;
