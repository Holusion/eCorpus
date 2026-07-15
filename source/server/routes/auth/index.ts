
import { Router } from "express";
import { rateLimit } from 'express-rate-limit'
import bodyParser from "body-parser";

import { either, getUser, policy, useTemplateProperties  } from "../../utils/locals.js";
import { noFraming } from "../../utils/headers.js";
import { csrfProtectAnonymous } from "../../utils/csrf.js";
import wrap from "../../utils/wrapAsync.js";
import { getLogin, getLoginPayload, getLoginLink, sendLoginLink, postLogin } from "./login.js";
import { postLogout } from "./logout.js";
import { deleteSession, getOwnSessions } from "./sessions.js";
import { deleteOwnToken, getOwnTokens, postToken } from "./tokens.js";
import { deleteClient, deleteGrant, getAuthorize, getClients, getGrants, postAuthorize, postClient, postRevoke, postToken as postOAuthToken } from "./oauth.js";
import getSceneAccess from "./access/get.js";
import patchSceneAccess from "./access/patch.js";
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
//Returning a login link for an arbitrary user mints a session for whoever
//holds it: users:admin is non-mintable, so this stays session-only — an `all`
//token cannot impersonate its way past token revocation or expiry.
router.get("/login/:username/link", policy({ scope: "users:admin" }), wrap(getLoginLink));
//Sending the link (to the *target user's* mailbox — never returned to the
//requester, so no escalation) is open to everyone under a strict rate limit.
//The user-provisioning scope (users:write — an admin session or an
//admin's users:write/all token, consistent with POST /users onboarding
//emails) is exempt; any authorization refusal falls through to the
//rate-limited branch.
router.post("/login/:username/link", either(policy({ scope: "users:write" }), rateLimit({
  //Special case of real low rate-limiting for non-admin users to send emails
	windowMs: 1 * 60 * 1000, // 1 minute
	limit: 1, // Limit each IP to 1 request per `window`.
	standardHeaders: 'draft-7',
	legacyHeaders: false,
  validate: {trustProxy: false}
})), wrap(sendLoginLink));

router.post("/logout",  useJSON, useURLEncoded, wrap(postLogout));

//Account management. Listing/revoking one's own credentials is account:read/
//write; *minting* a new token is account:admin — the non-mintable, session-only
//top of the family, so a token (even `all`-scoped) can never create another
//token or inspect the credentials it lives next to.
router.get("/sessions", policy({ scope: "account:read", access: null }), wrap(getOwnSessions));
router.delete("/sessions/:id", policy({ scope: "account:write", access: null }), wrap(deleteSession));

router.get("/tokens", policy({ scope: "account:read", access: null }), wrap(getOwnTokens));
router.post("/tokens", policy({ scope: "account:admin", access: null }), useJSON, wrap(postToken));
router.delete("/tokens/:id", policy({ scope: "account:write", access: null }), wrap(deleteOwnToken));

//"Authorized applications": persisted OAuth consents. Revoking one stops
//silent re-authorization and revokes the client's tokens for this user.
router.get("/oauth/grants", policy({ scope: "account:read", access: null }), wrap(getGrants));
router.delete("/oauth/grants/:clientId", policy({ scope: "account:write", access: null }), wrap(deleteGrant));

//OAuth2 authorization server (authorization code + PKCE)
router.get("/oauth/authorize", wrap(getAuthorize));
router.post("/oauth/authorize", useURLEncoded, wrap(postAuthorize));
router.post("/oauth/token", useURLEncoded, wrap(postOAuthToken));
router.post("/oauth/revoke", useURLEncoded, wrap(postRevoke));
//The OAuth client registry is instance configuration. Registering a client
//(a name users will trust on the consent page, plus its redirect URIs) is a
//phishing primitive, so like the config PATCH it rides the non-mintable
//instance:write; the inventory is instance:read (mintable, monitoring).
router.get("/oauth/clients", policy({ scope: "instance:read" }), wrap(getClients));
router.post("/oauth/clients", policy({ scope: "instance:write" }), useJSON, wrap(postClient));
router.delete("/oauth/clients/:id", policy({ scope: "instance:write" }), wrap(deleteClient));


//Reading a scene's ACL needs an identity (corpus:read — the baseline scope
//anonymous doesn't hold) on top of scene read access: anonymous readers of a
//public scene don't get to enumerate its users.
router.get("/access/:scene", policy({ scope: "corpus:read", access: "read" }), wrap(getSceneAccess));
router.patch("/access/:scene", policy({ access: "admin" }), useJSON, wrap(patchSceneAccess));


export default router;
