
import { Router } from "express";
import { rateLimit } from 'express-rate-limit'
import bodyParser from "body-parser";

import { canAdmin, canRead, either, getUser, isAdministrator, isUser, policy, useTemplateProperties  } from "../../utils/locals.js";
import { noFraming } from "../../utils/headers.js";
import { csrfProtectAnonymous } from "../../utils/csrf.js";
import wrap from "../../utils/wrapAsync.js";
import { getLogin, getLoginPayload, getLoginLink, sendLoginLink, postLogin } from "./login.js";
import { postLogout } from "./logout.js";
import { deleteSession, getOwnSessions } from "./sessions.js";
import { deleteOwnToken, getOwnTokens, postToken } from "./tokens.js";
import { deleteClient, deleteGrant, getAuthorize, getClients, getGrants, postAuthorize, postClient, postRevoke, postToken as postOAuthToken } from "./oauth.js";
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

//A clickjacked click on the OAuth consent page would grant a token:
//deny framing for the whole auth scope (none of it is meant to be embedded).
router.use(noFraming);


router.get("/", wrap(async function(req, res){
  return res.status(200).send(User.safe(getUser(req) ?? {}));
}));

router.get("/payload/:payload", wrap(getLoginPayload));

router.get("/login", wrap(getLogin));
router.post("/login",
  //A forged cross-site login would seat the victim in the attacker's account.
  //The global csrfProtection exempts anonymous requests, so guard login itself.
  csrfProtectAnonymous,
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

//Account management. Listing/revoking one's own credentials is account:read/
//write; *minting* a new token is account:grant — the non-mintable, session-only
//capability, so a token (even `all`-scoped) can never create another token or
//inspect the credentials it lives next to.
router.get("/sessions", policy({ scope: "account:read", perms: null }), wrap(getOwnSessions));
router.delete("/sessions/:id", policy({ scope: "account:write", perms: null }), wrap(deleteSession));

router.get("/tokens", policy({ scope: "account:read", perms: null }), wrap(getOwnTokens));
router.post("/tokens", policy({ scope: "account:grant", perms: null }), useJSON, wrap(postToken));
router.delete("/tokens/:id", policy({ scope: "account:write", perms: null }), wrap(deleteOwnToken));

//"Authorized applications": persisted OAuth consents. Revoking one stops
//silent re-authorization and revokes the client's tokens for this user.
router.get("/oauth/grants", policy({ scope: "account:read", perms: null }), wrap(getGrants));
router.delete("/oauth/grants/:clientId", policy({ scope: "account:write", perms: null }), wrap(deleteGrant));

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
