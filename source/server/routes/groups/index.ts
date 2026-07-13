
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

//Group management follows the two-rung groups family: groups:read to inspect
//the group inventory, groups:write (⟺ level ≥ manage) to create, delete and
//re-member. Reading *one* group is resource-scoped (`on:"group"`) instead: its
//members may read it without holding groups:read, like the group's HTML view.
//A future per-group role (owner, moderator…) extends the "group" access
//resolver in locals.ts — these routes and scopes would not change.
router.get("/", policy({ scope: "groups:read" }), wrap(getGroups));
router.post("/", policy({ scope: "groups:write" }), bodyParser.json(), wrap(postGroups));
router.get("/:group", policy({ perms: "read", on: "group" }), wrap(getGroup));
router.delete("/:group", policy({ scope: "groups:write" }), wrap(deleteGroup))
router.put("/:group/:member", policy({ scope: "groups:write" }), wrap(putMember));
router.delete("/:group/:member", policy({ scope: "groups:write" }), wrap(deleteMember));

export default router;
