import { Router } from "express";
import bodyParser from "body-parser";

import wrap from "../../utils/wrapAsync.js";

import getTags from "./get.js";
import getTag from "./tag/get.js";
import { isUser } from "../../utils/locals.js";
import patchTags from "./patch.js";

const router = Router();

router.get("/",  wrap(getTags));
router.get("/:tag", wrap(getTag));
router.patch("/", isUser, bodyParser.json(), wrap(patchTags));

export default router;