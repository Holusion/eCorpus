
import { NextFunction, Request, Response, Router } from "express";

import UserManager from "../../auth/UserManager.js";
import { getUserManager, policy } from "../../utils/locals.js";
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



router.get("/", policy({ scope: "users:read", access: null }), wrap(async (req, res)=>{
  let userManager :UserManager = getUserManager(req);
  //istanbul ignore if
  if(!userManager) throw new Error("Badly configured app : userManager is not defined in app.locals");
  let users = await userManager.getUsers(true, {
    limit: qsToInt(req.query.limit),
    offset: qsToInt(req.query.offset),
  });
  res.status(200).send(users);
}));

//User provisioning is deliberately mintable (users:write), so an import script
//can run on a token — but creating an *administrator* needs the non-mintable
//users:admin (see postUser). Special case: an empty user table accepts its
//first user unauthenticated (initial setup).
const usersWriteGuard = policy({ scope: "users:write", access: null });
function isUsersWriteOrOpen(req: Request, res: Response, next: NextFunction) {
  usersWriteGuard(req, res, (err?: any) => {
    if (!err) return next();
    getUserManager(req).getUsers().then((users) => {
      if (users.length === 0) return next();
      next(err);
    }, next);
  });
}
router.post("/", isUsersWriteOrOpen, bodyParser.json(), bodyParser.urlencoded({extended: false}), wrap(postUser));
router.delete("/:uid", policy({ scope: "users:write", access: null }), wrap(handleDeleteUser));
//Self-service profile edits or admin-on-others; the `on:"user"` ACL gates
//self-or-admin (write = yourself, admin = an administrator). The scope is the
//non-mintable account:admin: a patch can rotate the password or email — i.e.
//convert a credential into a session — so no token (even `all`) reaches this,
//per NON_MINTABLE_SCOPES. handlePatchUser still refines the level-change rules.
router.patch("/:uid", policy({ scope: "account:admin", access: "write", on: "user" }), bodyParser.json(), wrap(handlePatchUser));
router.get("/:uid/sessions", policy({ scope: "users:read", access: null }), wrap(getUserSessions));
router.get("/:uid/tokens", policy({ scope: "users:read", access: null }), wrap(getUserTokens));
router.delete("/:uid/tokens/:id", policy({ scope: "users:write", access: null }), wrap(deleteUserToken));

export default router;
