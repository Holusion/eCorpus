import { Router } from "express";

import wrap from "../../utils/wrapAsync.js";

import { policy } from "../../utils/locals.js";

import { createUserTask } from "./post.js";
import { putTaskArtifact } from "./task/artifacts/put.js";
import bodyParser from "body-parser";
import { getTaskArtifact } from "./task/artifacts/get.js";
import { getTask } from "./task/get.js";
import { deleteTask } from "./task/delete.js";
import { getTaskTree } from "./task/tree/get.js";

const jsonParser = bodyParser.json();

const router = Router();

//Creating a task is a create-level operation (tasks:write in levelScopes ⟺
//level ≥ create, reproducing the old isCreator) plus the tasks:write credential.
router.post("/", policy({ scope: "tasks:write" }), jsonParser, wrap(createUserTask));

//Task authorization is derived from the task (own it, or have access to its
//scene): the `on:"task"` resolver folds in what taskAccess did by hand. read
//needs tasks:read, admin (delete/artifact write) needs tasks:write.
router.get("/:id(\\d+)", policy({ perms: "read", on: "task" }), wrap(getTask));
router.get("/:id(\\d+)/tree", policy({ perms: "read", on: "task" }), wrap(getTaskTree));
router.delete("/:id(\\d+)", policy({ perms: "admin", on: "task" }), wrap(deleteTask));
router.put("/:id(\\d+)/artifact", policy({ perms: "admin", on: "task" }), wrap(putTaskArtifact));
router.get("/:id(\\d+)/artifact", policy({ perms: "read", on: "task" }), wrap(getTaskArtifact));

export default router;
