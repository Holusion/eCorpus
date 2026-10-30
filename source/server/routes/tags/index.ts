import express, { Router } from "express";


import getTags from "./get.js";
import getTag from "./tag/get.js";
import { policy } from "../../utils/locals.js";
import patchTags from "./patch.js";

const router = Router();

router.get("/",  getTags);
router.get("/:tag", getTag);
//Tagging is a per-scene write, but the scenes are named in the request body:
//the handler walks each one's ACL (capped by the credential's scene scope),
//so the route itself only requires an identity — the baseline corpus:read.
router.patch("/", policy({ scope: "corpus:read" }), express.json(), patchTags);

export default router;