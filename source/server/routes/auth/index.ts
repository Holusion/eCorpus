
import { Router } from "express";
import { rateLimit } from 'express-rate-limit'
import bodyParser from "body-parser";

import { canAdmin, canRead, either, getUser, isAdministrator, isUser, useTemplateProperties  } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import { getLogin, getLoginPayload, getLoginLink, sendLoginLink, postLogin } from "./login.js";
import { postLogout } from "./logout.js";
import { deleteSession, getOwnSessions } from "./sessions.js";
import { deleteOwnToken, getOwnTokens, postToken } from "./tokens.js";
import { deleteClient, getAuthorize, getClients, postAuthorize, postClient, postRevoke, postToken as postOAuthToken } from "./oauth.js";
import getPermissions from "./access/get.js";
import patchPermissions from "./access/patch.js";
import User from "../../auth/User.js";

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


router.get("/", wrap(async function(req, res){
  return res.status(200).send(User.safe(getUser(req) ?? {}));
}));

router.get("/payload/:payload", wrap(getLoginPayload));

router.get("/login", wrap(getLogin));
router.post("/login",
  //Password verification costs a full scrypt: rate-limit to slow down online brute-force.
  //The TEST escape hatch is for integration tests that log in dozens of times from one IP.
  rateLimit({
    windowMs: 60 * 1000,
    limit: process.env["TEST"] ? 10000 : 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    validate: {trustProxy: false},
  }),
  useJSON,
  useURLEncoded,
  useTemplateProperties,
  wrap(postLogin),
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

router.post("/logout",  useJSON, useURLEncoded, wrap(postLogout));

router.get("/sessions", isUser, wrap(getOwnSessions));
router.delete("/sessions/:id", isUser, wrap(deleteSession));

router.get("/tokens", isUser, wrap(getOwnTokens));
router.post("/tokens", isUser, useJSON, wrap(postToken));
router.delete("/tokens/:id", isUser, wrap(deleteOwnToken));

//OAuth2 authorization server (authorization code + PKCE)
router.get("/oauth/authorize", wrap(getAuthorize));
router.post("/oauth/authorize", useURLEncoded, wrap(postAuthorize));
router.post("/oauth/token", useURLEncoded, wrap(postOAuthToken));
router.post("/oauth/revoke", useURLEncoded, wrap(postRevoke));
router.get("/oauth/clients", isAdministrator, wrap(getClients));
router.post("/oauth/clients", isAdministrator, useJSON, wrap(postClient));
router.delete("/oauth/clients/:id", isAdministrator, wrap(deleteClient));


router.get("/access/:scene", isUser, canRead, wrap(getPermissions));
router.patch("/access/:scene", canAdmin, useJSON, wrap(patchPermissions));


export default router;
