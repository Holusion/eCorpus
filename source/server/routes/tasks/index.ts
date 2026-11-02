import express, { Router } from "express";


import { numericParam, policy } from "../../utils/locals.js";

import { createUserTask } from "./post.js";
import { putTaskArtifact } from "./task/artifacts/put.js";
import { getTaskArtifact } from "./task/artifacts/get.js";
import { getTask } from "./task/get.js";
import { deleteTask } from "./task/delete.js";
import { getTaskTree } from "./task/tree/get.js";

const jsonParser = express.json();

const router = Router();

//Creating a task is a create-level operation (tasks:write in levelScopes ⟺
//level ≥ create, reproducing the old isCreator) plus the tasks:write credential.
router.post("/", policy({ scope: "tasks:write" }), jsonParser, createUserTask);

//Task authorization is derived from the task (own it, or have access to its
//scene): the `on:"task"` resolver folds in what taskAccess did by hand. The
//credential scope follows the family ladder: read needs tasks:read, admin
//(delete/artifact write) needs tasks:admin.
router.get("/:id", numericParam("id"), policy({ access: "read", on: "task" }), getTask);
router.get("/:id/tree", numericParam("id"), policy({ access: "read", on: "task" }), getTaskTree);
router.delete("/:id", numericParam("id"), policy({ access: "admin", on: "task" }), deleteTask);
router.put("/:id/artifact", numericParam("id"), policy({ access: "admin", on: "task" }), putTaskArtifact);
router.get("/:id/artifact", numericParam("id"), policy({ access: "read", on: "task" }), getTaskArtifact);

export default router;
