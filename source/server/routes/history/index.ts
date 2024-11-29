
import { Router } from "express";
import { canAdmin, canRead } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";

import bodyParser from "body-parser";


import { postSceneHistory } from "./post.js";
import getSceneHistory from "./get.js";
import handleGetFileRef from "./refs/get.js";
import handleGetDiff from "./diff/get.js";

const router = Router();

/** Configure cache behaviour for the whole API
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  //Browser should always make the request
  res.set("Cache-Control", "no-cache");
  next();
});

router.use("/:scene", canRead);

router.get("/:scene", wrap(getSceneHistory));
router.post("/:scene", canAdmin, bodyParser.json(), wrap(postSceneHistory));

router.get("/:scene/diff/:fromRef/:toRef", handleGetDiff);
router.get("/:scene/:ref(\d+)/:name(*)", handleGetFileRef);

export default router;
