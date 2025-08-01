
import { Router } from "express";

import { isAdministrator } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import handleGetStats from "./stats/index.js";
import handleMailtest from "./mailtest.js";
import handleGetConfig from "./config/get.js";
import bodyParser from "body-parser";


const router = Router();

/** Configure cache behaviour for the whole API
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  //Browser should always make the request
  res.set("Cache-Control", "no-cache");
  next();
});



router.get("/stats", isAdministrator, wrap(handleGetStats));
router.get("/config", isAdministrator, wrap(handleGetConfig));
router.post("/mailtest", isAdministrator, bodyParser.json(), wrap(handleMailtest));

export default router;
