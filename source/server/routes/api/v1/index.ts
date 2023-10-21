
import path from "path";
import { Router } from "express";
import { rateLimit } from 'express-rate-limit'

import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import { BadRequestError } from "../../../utils/errors.js";
import { canAdmin, canRead, either, getUserManager, isAdministrator, isAdministratorOrOpen, isUser } from "../../../utils/locals.js";
import wrap from "../../../utils/wrapAsync.js";
import bodyParser from "body-parser";
import { getLogin, getLoginLink, sendLoginLink, postLogin } from "./login.js";
import { postLogout } from "./logout.js";
import postScene from "./scenes/scene/post.js";
import getScenes from "./scenes/get.js";
import getSceneHistory from "./scenes/scene/history/get.js";
import getFiles from "./scenes/scene/files/get.js";

import getScene from "./scenes/scene/get.js";
import getPermissions from "./scenes/scene/permissions/get.js";
import patchPermissions from "./scenes/scene/permissions/patch.js";
import postUser from "./users/post.js";
import handleDeleteUser from "./users/uid/delete.js";
import { handlePatchUser } from "./users/uid/patch.js";
import { postSceneHistory } from "./scenes/scene/history/post.js";
import handleGetStats from "./admin/stats/index.js";
import postScenes from "./scenes/post.js";
import patchScene from "./scenes/scene/patch.js";
import handleMailtest from "./admin/mailtest.js";


const router = Router();

/** Configure cache behaviour for the whole API
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  //Browser should always make the request
  res.set("Cache-Control", "max-age=0, must-revalidate");
  next();
});

router.get("/admin/stats", isAdministrator, wrap(handleGetStats));
router.post("/admin/mailtest", isAdministrator, wrap(handleMailtest));

router.use("/login", (req, res, next)=>{
  res.append("Cache-Control", "private");
  next();
});
router.get("/login", wrap(getLogin));
router.post("/login", bodyParser.json(), postLogin);
router.get("/login/:username/link", isAdministrator, wrap(getLoginLink));
router.post("/login/:username/link", either(isAdministrator, rateLimit({
  //Special case of real low rate-limiting for non-admin users to send emails
	windowMs: 1 * 60 * 1000, // 1 minute
	limit: 1, // Limit each IP to 1 request per `window`.
	standardHeaders: 'draft-7',
	legacyHeaders: false,
})), wrap(sendLoginLink));

router.post("/logout", postLogout);


router.get("/users", isAdministrator, wrap(async (req, res)=>{
  let userManager :UserManager = getUserManager(req);
  //istanbul ignore if
  if(!userManager) throw new Error("Badly configured app : userManager is not defined in app.locals");
  let users = await userManager.getUsers(true);
  res.status(200).send(users);
}));

router.post("/users", isAdministratorOrOpen, bodyParser.json(), wrap(postUser));
router.delete("/users/:uid", isAdministrator, wrap(handleDeleteUser));
router.patch("/users/:uid", bodyParser.json(), wrap(handlePatchUser));

router.get("/scenes", wrap(getScenes));
router.post("/scenes", isAdministrator, wrap(postScenes));

router.post("/scenes/:scene", isUser, wrap(postScene));
router.patch("/scenes/:scene", canAdmin, bodyParser.json(), wrap(patchScene));

router.use("/scenes/:scene", canRead);
router.get("/scenes/:scene/history", wrap(getSceneHistory));
router.post("/scenes/:scene/history", bodyParser.json(), wrap(postSceneHistory));
router.get("/scenes/:scene", wrap(getScene));
router.get("/scenes/:scene/files", wrap(getFiles));
router.get("/scenes/:scene/permissions", wrap(getPermissions));
router.patch("/scenes/:scene/permissions", canAdmin, bodyParser.json(), wrap(patchPermissions));

export default router;
