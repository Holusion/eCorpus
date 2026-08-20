
import { Router } from "express";

import { policy } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import handleGetStats from "./stats/index.js";
import handleMailtest from "./mail/sendtest.js";
import handleGetConfig from "./config/get.js";
import handlePatchConfig from "./config/patch.js";
import bodyParser from "body-parser";
import handleRenderMail from "./mail/render.js";


const router = Router();

/** Configure cache behaviour for the whole API
 * Settings can be changed individually further down the line
 */
router.use((req, res, next)=>{
  //Browser should always make the request
  res.set("Cache-Control", "no-cache");
  next();
});



//Instance administration (stats, runtime config, mail plumbing) is the
//`instance` family, held only by admins (through `all`). instance:read is
//mintable — the monitoring use case: an agent scraping /admin/stats or
//backing up /admin/config. instance:write is NOT (NON_MINTABLE_SCOPES):
//rewriting runtime config can redirect smart_host and intercept login-link
//emails, so config changes require an interactive admin session.
router.get("/stats", policy({ scope: "instance:read" }), wrap(handleGetStats));
router.get("/config", policy({ scope: "instance:read" }), wrap(handleGetConfig));
router.patch("/config", policy({ scope: "instance:write" }), bodyParser.json(), wrap(handlePatchConfig));

router.post("/mail/test", policy({ scope: "instance:write" }), bodyParser.json(), wrap(handleMailtest));
router.get("/mail/render/:name", policy({ scope: "instance:read" }), bodyParser.json(), wrap(handleRenderMail));

export default router;
