
import { Router } from "express";

import UserManager from "../../auth/UserManager.js";
import { getUserManager, isAdministratorOrOpen, policy } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import { qsToInt } from "../../utils/query.js";
import bodyParser from "body-parser";

import postUser from "./post.js";
import handleDeleteUser from "./uid/delete.js";
import { handlePatchUser } from "./uid/patch.js";
import { getUserSessions } from "../auth/sessions.js";
import { deleteUserToken, getUserTokens } from "../auth/tokens.js";

const router = Router();

/** Configure cache behaviour for the whole API
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  //Browser should always make the request
  res.set("Cache-Control", "no-cache");
  next();
});



router.get("/", policy({ scope: "users:read", perms: null }), wrap(async (req, res)=>{
  let userManager :UserManager = getUserManager(req);
  //istanbul ignore if
  if(!userManager) throw new Error("Badly configured app : userManager is not defined in app.locals");
  let users = await userManager.getUsers(true, {
    limit: qsToInt(req.query.limit),
    offset: qsToInt(req.query.offset),
  });
  res.status(200).send(users);
}));

router.post("/", isAdministratorOrOpen, bodyParser.json(), bodyParser.urlencoded({extended: false}), wrap(postUser));
router.delete("/:uid", policy({ scope: "users:write", perms: null }), wrap(handleDeleteUser));
//Self-service profile edits or admin-on-others: account:write gates the
//credential, and the `on:"user"` ACL gates self-or-admin (write = yourself,
//admin = an administrator). handlePatchUser still refines the level-change rules.
router.patch("/:uid", policy({ scope: "account:write", perms: "write", on: "user" }), bodyParser.json(), wrap(handlePatchUser));
router.get("/:uid/sessions", policy({ scope: "users:read", perms: null }), wrap(getUserSessions));
router.get("/:uid/tokens", policy({ scope: "users:read", perms: null }), wrap(getUserTokens));
router.delete("/:uid/tokens/:id", policy({ scope: "users:write", perms: null }), wrap(deleteUserToken));

export default router;
