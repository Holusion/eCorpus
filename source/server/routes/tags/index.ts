import { Router } from "express";
import bodyParser from "body-parser";

import wrap from "../../utils/wrapAsync.js";

import getTags from "./get.js";
import getTag from "./tag/get.js";
import { policy } from "../../utils/locals.js";
import patchTags from "./patch.js";

const router = Router();

router.get("/",  wrap(getTags));
router.get("/:tag", wrap(getTag));
//Tagging is a per-scene write, but the scenes are named in the request body:
//the handler walks each one's ACL (capped by the credential's scene scope),
//so the route itself only requires an identity — the baseline corpus:read.
router.patch("/", policy({ scope: "corpus:read" }), bodyParser.json(), wrap(patchTags));

export default router;