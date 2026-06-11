import { createHash } from "crypto";
import { Request, Response } from "express";

import { DEFAULT_TOKEN_LIFETIME, TOKEN_SCOPES, isValidScope, parseScope } from "../../auth/Token.js";
import { OAuthClient } from "../../auth/UserManager.js";
import { BadRequestError, UnauthorizedError } from "../../utils/errors.js";
import { getAuthMethod, getHost, getUser, getUserManager, useTemplateProperties } from "../../utils/locals.js";

/**
 * OAuth2 authorization server endpoints (authorization code grant with
 * mandatory PKCE — see docs/auth-redesign.md §3.5).
 *
 * Error handling follows RFC6749: invalid client/redirect_uri fail on our own
 * pages (never redirect to an unvalidated URI); once the redirect_uri is
 * validated, errors are reported to the client through it.
 */


/**
 * Validate client_id and redirect_uri.
 * These two must be correct before anything else: every other error is
 * reported by redirecting to redirect_uri, which is only safe once it has
 * been matched against the client's registered URIs.
 * @throws {BadRequestError}
 */
async function validateClient(req: Request, client_id: any, redirect_uri: any): Promise<{client: OAuthClient, redirectUri: string}>{
  const id = parseInt(client_id, 10);
  if(typeof client_id !== "string" || Number.isNaN(id)) throw new BadRequestError(`Invalid client_id`);
  let client;
  try{
    client = await getUserManager(req).getClient(id);
  }catch(e){
    throw new BadRequestError(`Unknown client_id`);
  }
  if(typeof redirect_uri !== "string" || client.redirectUris.indexOf(redirect_uri) === -1){
    throw new BadRequestError(`redirect_uri does not match any registered URI for this client`);
  }
  return {client, redirectUri: redirect_uri};
}

/** Report an error to the client through the (validated) redirect URI */
function errorRedirect(res: Response, redirectUri: string, state: any, error: string, description?: string){
  const target = new URL(redirectUri);
  target.searchParams.set("error", error);
  if(description) target.searchParams.set("error_description", description);
  if(typeof state === "string" && state) target.searchParams.set("state", state);
  return res.redirect(302, target.toString());
}

/**
 * Validate the grant parameters shared by the GET (consent page) and POST
 * (consent submission) sides of the authorize endpoint.
 * @returns the validated scope, or null if an error redirect was already sent
 */
function validateGrantParams(res: Response, redirectUri: string, q: Record<string, any>): string[] | null{
  const {response_type, state, scope: rawScope, code_challenge, code_challenge_method} = q;
  if(response_type !== "code"){
    errorRedirect(res, redirectUri, state, "unsupported_response_type");
    return null;
  }
  if(typeof code_challenge !== "string" || !/^[-\w]{43}$/.test(code_challenge)){
    errorRedirect(res, redirectUri, state, "invalid_request", "A S256 PKCE code_challenge is required");
    return null;
  }
  if(code_challenge_method !== "S256"){
    errorRedirect(res, redirectUri, state, "invalid_request", "code_challenge_method must be S256");
    return null;
  }
  let scope: string[] = (typeof rawScope === "string" && rawScope.length) ? parseScope(rawScope) : ["all"];
  if(!isValidScope(scope)){
    errorRedirect(res, redirectUri, state, "invalid_scope");
    return null;
  }
  return scope;
}

/** Does a persisted consent cover the scope a client is now requesting? */
function scopeCovers(granted: string[], requested: string[]): boolean{
  return granted.includes("all") || requested.every(s=> granted.includes(s));
}

/** Mint a single-use code and deliver it through the (validated) redirect URI */
async function issueCode(req: Request, res: Response, opts: {clientId: number, uid: number, scope: string[], redirectUri: string, codeChallenge: string, state: string}){
  const code = await getUserManager(req).createAuthorizationCode({
    clientId: opts.clientId,
    uid: opts.uid,
    scope: opts.scope,
    redirectUri: opts.redirectUri,
    codeChallenge: opts.codeChallenge,
  });
  const target = new URL(opts.redirectUri);
  target.searchParams.set("code", code);
  if(opts.state) target.searchParams.set("state", opts.state);
  res.redirect(302, target.toString());
}

/**
 * GET /auth/oauth/authorize
 * Validates the authorization request, then either re-issues a code silently
 * (the user holds a session and a persisted consent covering the requested
 * scope — this is what makes periodic token renewal a no-click affair) or
 * renders the consent page. Anonymous users are bounced through the login
 * page and back.
 *
 * The `prompt` parameter follows the OIDC convention:
 * - `none`: never interact — report `login_required`/`consent_required`
 *   through the redirect URI instead, so clients can renew in a hidden frame
 *   or probe before falling back to an interactive flow;
 * - `consent`: always show the consent page, even when a grant covers it.
 */
export async function getAuthorize(req: Request, res: Response){
  const {client, redirectUri} = await validateClient(req, req.query.client_id, req.query.redirect_uri);
  const prompt = typeof req.query.prompt === "string" ? req.query.prompt : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  const user = getUser(req);
  if(!user || user.level === "none" || getAuthMethod(res) !== "session"){
    if(prompt === "none"){
      return errorRedirect(res, redirectUri, state, "login_required");
    }
    return res.redirect(302, `/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }

  const scope = validateGrantParams(res, redirectUri, req.query);
  if(scope === null) return;

  if(prompt !== "consent"){
    const grant = await getUserManager(req).getGrant(user.uid, client.id);
    if(grant && scopeCovers(grant.scope, scope)){
      //Renewal: the user already consented to (at least) this scope.
      return issueCode(req, res, {
        clientId: client.id,
        uid: user.uid,
        scope,
        redirectUri,
        codeChallenge: req.query.code_challenge as string,
        state,
      });
    }
  }
  if(prompt === "none"){
    return errorRedirect(res, redirectUri, state, "consent_required");
  }

  useTemplateProperties(req, res, ()=>{
    res.render("authorize", {
      title: "Authorize",
      client: {name: client.name, host: new URL(redirectUri).host},
      scope: scope.join(" "),
      fields: {
        response_type: "code",
        client_id: String(client.id),
        redirect_uri: redirectUri,
        state,
        scope: scope.join(" "),
        code_challenge: req.query.code_challenge,
        code_challenge_method: "S256",
      },
    });
  });
}

/**
 * POST /auth/oauth/authorize
 * Consent submission: mint a single-use authorization code and send it back
 * through the redirect URI. Only a session-authenticated browser may consent:
 * a stolen API token must not be able to grant itself further access.
 */
export async function postAuthorize(req: Request, res: Response){
  const {client, redirectUri} = await validateClient(req, req.body.client_id, req.body.redirect_uri);

  const user = getUser(req);
  if(!user || user.level === "none" || getAuthMethod(res) !== "session"){
    throw new UnauthorizedError(`Consent requires an authenticated session`);
  }

  const scope = validateGrantParams(res, redirectUri, req.body);
  if(scope === null) return;

  const state = typeof req.body.state === "string" ? req.body.state : "";
  if(req.body.action === "deny"){
    return errorRedirect(res, redirectUri, state, "access_denied");
  }

  //Persist the consent so future authorizations for a covered scope are
  //silent (see getAuthorize). Revocable from the "authorized applications" UI.
  await getUserManager(req).upsertGrant(user.uid, client.id, scope);

  return issueCode(req, res, {
    clientId: client.id,
    uid: user.uid,
    scope,
    redirectUri,
    codeChallenge: req.body.code_challenge,
    state,
  });
}

/**
 * GET /auth/oauth/grants
 * The requester's "authorized applications": every client they consented to.
 */
export async function getGrants(req: Request, res: Response){
  const user = getUser(req)!;
  const grants = await getUserManager(req).getGrants(user.uid);
  res.status(200).send(grants.map(g=>({
    client_id: g.clientId,
    client_name: g.clientName,
    scope: g.scope,
    created: g.created.toISOString(),
    updated: g.updated.toISOString(),
  })));
}

/**
 * DELETE /auth/oauth/grants/:clientId
 * Withdraw one's own consent: stops silent re-authorization and revokes every
 * token the client obtained for this user. Idempotent.
 */
export async function deleteGrant(req: Request, res: Response){
  const clientId = parseInt(req.params.clientId, 10);
  if(Number.isNaN(clientId)) throw new BadRequestError(`Invalid client id: ${req.params.clientId}`);
  const user = getUser(req)!;
  await getUserManager(req).removeGrant(user.uid, clientId);
  res.status(204).send();
}


function oauthError(res: Response, status: number, error: string, description?: string){
  res.status(status).send({error, ...(description ? {error_description: description} : {})});
}

/**
 * Client credentials may come from an `Authorization: Basic` header
 * (client_secret_basic — REQUIRED to support by RFC6749 §2.3.1) or from the
 * request body (client_secret_post). This is authentication of the *client
 * service* on this single endpoint, unrelated to the removed user Basic auth.
 */
function getClientCredentials(req: Request): {clientId: string, secret: string | null} | null{
  const auth = req.get("Authorization");
  if(auth && auth.startsWith("Basic ")){
    const [id, secret] = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf-8").split(":");
    if(!id) return null;
    return {clientId: decodeURIComponent(id), secret: secret ? decodeURIComponent(secret) : null};
  }
  if(typeof req.body.client_id === "string"){
    return {clientId: req.body.client_id, secret: typeof req.body.client_secret === "string" ? req.body.client_secret : null};
  }
  return null;
}

/**
 * POST /auth/oauth/token
 * Exchange an authorization code (+ PKCE verifier) for an access token.
 */
export async function postToken(req: Request, res: Response){
  //RFC6749 §5.1: token responses must not be cached
  res.set("Cache-Control", "no-store").set("Pragma", "no-cache");

  const {grant_type, code, redirect_uri, code_verifier} = req.body;
  if(grant_type !== "authorization_code"){
    return oauthError(res, 400, "unsupported_grant_type");
  }
  if(typeof code !== "string" || typeof redirect_uri !== "string" || typeof code_verifier !== "string"){
    return oauthError(res, 400, "invalid_request", "code, redirect_uri and code_verifier are required");
  }

  const credentials = getClientCredentials(req);
  if(!credentials){
    return oauthError(res, 401, "invalid_client");
  }
  const clientId = parseInt(credentials.clientId, 10);
  if(Number.isNaN(clientId)){
    return oauthError(res, 401, "invalid_client");
  }
  const userManager = getUserManager(req);
  let client;
  try{
    client = await userManager.authenticateClient(clientId, credentials.secret);
  }catch(e){
    res.set("WWW-Authenticate", `Basic realm="oauth/token"`);
    return oauthError(res, 401, "invalid_client");
  }

  const grant = await userManager.exchangeAuthorizationCode(code);
  if(!grant
    || grant.clientId !== client.id
    || grant.redirectUri !== redirect_uri
    || grant.expires.valueOf() < Date.now()
  ){
    return oauthError(res, 400, "invalid_grant");
  }
  //PKCE (RFC7636 §4.6): the verifier must hash to the challenge the code was bound to
  const challenge = createHash("sha256").update(code_verifier).digest("base64url");
  if(challenge !== grant.codeChallenge){
    return oauthError(res, 400, "invalid_grant", "PKCE verification failed");
  }

  const {token} = await userManager.createToken(grant.uid, {
    name: client.name,
    scope: grant.scope,
    clientId: client.id,
    expires: new Date(Date.now() + DEFAULT_TOKEN_LIFETIME),
  });

  res.status(200).send({
    access_token: token,
    token_type: "Bearer",
    expires_in: Math.floor(DEFAULT_TOKEN_LIFETIME / 1000),
    scope: grant.scope.join(" "),
  });
}

/**
 * POST /auth/oauth/revoke (RFC7009)
 * Possession of the token is sufficient to revoke it.
 * Always answers 200, even for unknown or invalid tokens.
 */
export async function postRevoke(req: Request, res: Response){
  const {token} = req.body;
  if(typeof token === "string" && token.length){
    await getUserManager(req).removeTokenBySecret(token);
  }
  res.status(200).send({});
}

/**
 * GET /.well-known/oauth-authorization-server (RFC8414)
 */
export async function getMetadata(req: Request, res: Response){
  const host = getHost(req);
  res.set("Cache-Control", `max-age=${60 * 60}, public`).status(200).send({
    issuer: host.origin,
    authorization_endpoint: new URL("/auth/oauth/authorize", host).toString(),
    token_endpoint: new URL("/auth/oauth/token", host).toString(),
    revocation_endpoint: new URL("/auth/oauth/revoke", host).toString(),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
    scopes_supported: [...TOKEN_SCOPES],
  });
}


function serializeClient(c: OAuthClient){
  return {
    id: c.id,
    name: c.name,
    redirect_uris: c.redirectUris,
    confidential: c.confidential,
    created: c.created.toISOString(),
  };
}

/**
 * GET /auth/oauth/clients (admin)
 */
export async function getClients(req: Request, res: Response){
  const clients = await getUserManager(req).getClients();
  res.status(200).send(clients.map(serializeClient));
}

/**
 * POST /auth/oauth/clients (admin)
 * The client_secret is in the response — and nowhere else, ever again.
 */
export async function postClient(req: Request, res: Response){
  const requester = getUser(req)!;
  const {name, redirect_uris, confidential} = req.body ?? {};
  const {client, secret} = await getUserManager(req).createClient(name, redirect_uris, {
    createdBy: requester.uid,
    confidential: confidential !== false,
  });
  res.status(201).send({...serializeClient(client), client_secret: secret});
}

/**
 * DELETE /auth/oauth/clients/:id (admin)
 * Cascades: every token granted through this client is revoked.
 */
export async function deleteClient(req: Request, res: Response){
  const id = parseInt(req.params.id, 10);
  if(Number.isNaN(id)) throw new BadRequestError(`Invalid client id: ${req.params.id}`);
  await getUserManager(req).removeClient(id);
  res.status(204).send();
}
