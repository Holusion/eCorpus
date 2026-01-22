import { Router } from "express";

import wrap from "../../utils/wrapAsync.js";

import { canAdmin, canRead, isCreator, isUser } from "../../utils/locals.js";

import { createTask } from "./post.js";
import { putUploadTask } from "./artifacts/put.js";
import bodyParser from "body-parser";
import { getUploadTask } from "./artifacts/get.js";
import { getTask } from "./task/get.js";
import { deleteTask } from "./task/delete.js";

const router = Router();

router.use("/", isUser);
router.post("/", isCreator, bodyParser.json(), wrap(createTask));


router.put("/artifacts/:id", wrap(putUploadTask));
router.get("/artifacts/:id", wrap(getUploadTask));

router.delete("/task/:id(\\d+)", wrap(deleteTask));
router.get("/task/:id(\\d+)", wrap(getTask));

export default router;
