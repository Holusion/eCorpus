import express, { Router } from "express";

import { numericParam, policy } from "../../utils/locals.js";

import { postUpload } from "./post.js";
import { putUpload } from "./put.js";
import { putUploadDerivative } from "./derivatives/put.js";

const jsonParser = express.json();

const router = Router();

//Uploads are tasks (for now): they share the tasks scopes.
//Creating one is like creating a task: tasks:write.
router.post("/", policy({ scope: "tasks:write" }), jsonParser, postUpload);
//Writing data to it is like writing to a task's workspace: tasks:admin, on a task one owns.
router.put("/:id", numericParam("id"), policy({ access: "admin", on: "task" }), putUpload);
//Making a derivative also writes to the upload's scene: the handler checks that.
router.put("/:id/derivatives/:usage/:quality", numericParam("id"), policy({ access: "admin", on: "task" }), putUploadDerivative);

export default router;
