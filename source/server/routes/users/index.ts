
import { Router } from "express";

import UserManager from "../../auth/UserManager.js";
import { getUserManager, isAdministrator, isAdministratorOrOpen, isUser } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import bodyParser from "body-parser";

import postUser from "./post.js";
import handleDeleteUser from "./uid/delete.js";
import { handlePatchUser } from "./uid/patch.js";

const router = Router();

/** Configure cache behaviour for the whole API
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  //Browser should always make the request
  res.set("Cache-Control", "no-cache");
  next();
});



router.get("/", isAdministrator, wrap(async (req, res)=>{
  let userManager :UserManager = getUserManager(req);
  //istanbul ignore if
  if(!userManager) throw new Error("Badly configured app : userManager is not defined in app.locals");
  let users = await userManager.getUsers(true);
  res.status(200).send(users);
}));

router.post("/", isAdministratorOrOpen, bodyParser.json(), bodyParser.urlencoded({extended: false}), wrap(postUser));
router.delete("/:uid", isAdministrator, wrap(handleDeleteUser));
router.patch("/:uid", bodyParser.json(), wrap(handlePatchUser));

export default router;
