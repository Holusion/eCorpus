import { Router } from "express";

import wrap from "../../utils/wrapAsync.js";

import getTags from "./get.js";
import getTag from "./tag/get.js";

const router = Router();

router.get("/",  wrap(getTags));
router.get("/:tag", wrap(getTag));


export default router;