
import { Router } from "express";
import { rateLimit } from 'express-rate-limit'
import bodyParser from "body-parser";

import { canAdmin, canRead, either, isAdministrator } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import { getLogin, getLoginLink, sendLoginLink, postLogin } from "./login.js";
import { postLogout } from "./logout.js";
import getPermissions from "./access/get.js";
import patchPermissions from "./access/patch.js";
import User from "../../auth/User.js";
import { useTemplateProperties } from "../views/index.js";

const useJSON = bodyParser.json();
const useURLEncoded = bodyParser.urlencoded({
  extended: false //Contains only strings
})
const router = Router();

/** Configure cache behaviour for the whole API
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  //Browser should always make the request
  res.set("Cache-Control", "no-cache");
  next();
});


router.use("/", (req, res, next)=>{
  res.append("Cache-Control", "private");
  next();
});

router.get("/", wrap(async function(req, res){
  return res.status(200).send(User.safe((req as any).session as any));
}));

router.get("/login", wrap(getLogin));
router.post("/login", 
  useJSON,
  useURLEncoded,
  useTemplateProperties,
  postLogin,
);
router.get("/login/:username/link", isAdministrator, wrap(getLoginLink));
router.post("/login/:username/link", either(isAdministrator, rateLimit({
  //Special case of real low rate-limiting for non-admin users to send emails
	windowMs: 1 * 60 * 1000, // 1 minute
	limit: 1, // Limit each IP to 1 request per `window`.
	standardHeaders: 'draft-7',
	legacyHeaders: false,
  validate: {trustProxy: false}
})), wrap(sendLoginLink));

router.post("/logout", postLogout);


router.get("/access/:scene", canRead, wrap(getPermissions));
router.patch("/access/:scene", canAdmin, useJSON, wrap(patchPermissions));


export default router;
