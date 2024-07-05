import { Router } from "express";

import { isUser } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";

import getTags from "./get.js";
import getTag from "./tag/get.js";

const router = Router();

router.get("/tags", isUser, wrap(getTags));
router.get("/tags/:tag", isUser, wrap(getTag));


export default router;