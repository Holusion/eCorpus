
import { Router } from "express";
import wrap from "../../utils/wrapAsync.js";
import bodyParser from "body-parser";

import { policy } from "../../utils/locals.js";
import postGroups from "./post.js";
import getGroups from "./get.js";
import getGroup from "./group/get.js";
import putMember from "./group/member/put.js";
import deleteMember from "./group/member/delete.js";
import deleteGroup from "./group/delete.js";

const router = Router();

//Group management follows the three-rung groups family: groups:read to
//inspect the group inventory, groups:admin (⟺ level ≥ manage) to create
//groups. groups:write is reserved for per-group metadata edits — the rung a
//future per-group role (owner, moderator…) will exercise; no route uses it yet.
//Per-group operations are resource-scoped (`on:"group"`): members may read a
//group without holding groups:read (like the group's HTML view), and deletion
//or membership changes require "admin" access on *that* group — today only
//manage-level users reach it, but a future per-group role extends the "group"
//access resolver in locals.ts without touching these routes. Like scenes,
//insufficient access answers an existence-hiding 404.
router.get("/", policy({ scope: "groups:read" }), wrap(getGroups));
router.post("/", policy({ scope: "groups:admin" }), bodyParser.json(), wrap(postGroups));
router.get("/:group", policy({ access: "read", on: "group" }), wrap(getGroup));
router.delete("/:group", policy({ access: "admin", on: "group" }), wrap(deleteGroup))
router.put("/:group/:member", policy({ access: "admin", on: "group" }), wrap(putMember));
router.delete("/:group/:member", policy({ access: "admin", on: "group" }), wrap(deleteMember));

export default router;
