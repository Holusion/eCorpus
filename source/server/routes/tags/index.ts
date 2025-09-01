import { Router } from "express";
import bodyParser from "body-parser";

import wrap from "../../utils/wrapAsync.js";

import getTags from "./get.js";
import postTags from "./post.js"
import deleteTags from "./delete.js"
import getTag from "./tag/get.js";
import { isUser } from "../../utils/locals.js";

const router = Router();

router.get("/",  wrap(getTags));
router.get("/:tag", wrap(getTag));
router.post("/", isUser, bodyParser.json(), wrap(postTags));
router.delete("/", isUser, bodyParser.json(), wrap(deleteTags));

export default router;