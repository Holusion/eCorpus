
import { Router } from "express";
import wrap from "../../utils/wrapAsync.js";
import bodyParser from "body-parser";

import {isManage, isUser } from "../../utils/locals.js";
import postGroups from "./post.js";
import getGroups from "./get.js";
import getGroup from "./group/get.js";
import putMember from "./group/member/put.js";
import deleteMember from "./group/member/delete.js";
import deleteGroup from "./group/delete.js";

const router = Router();

router.use("/", isManage);

router.get("/", wrap(getGroups));
router.post("/", bodyParser.json(), wrap(postGroups));
router.get("/:group", wrap(getGroup));
router.delete("/:group", wrap(deleteGroup))
router.put("/:group/:member", wrap(putMember));
router.delete("/:group/:member", wrap(deleteMember));

export default router;
