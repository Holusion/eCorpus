import { test, expect } from '../fixtures.js';
import type { BrowserContext, Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";

// The OAuth2 authorization-code + PKCE flow, driven through a real browser as a
// third-party application would: the user consents in eCorpus, the browser is
// redirected to the registered redirect URI with a code, and the code is
// exchanged for a token that then authenticates API calls.
//
// The redirect URI points at a lightweight same-origin endpoint (`/auth/`,
// which just returns the caller's identity as JSON) rather than a real external
// host: it stands in for the third-party callback while remaining reachable and
// free of any client-side script that would rewrite the URL we read the code
// from. We only care that the browser lands there carrying the code.
//
// Runs unauthenticated by default; each test logs a fresh user in so consent
// grants never bleed between tests.
test.use({ storageState: { cookies: [], origins: [] }, locale: "cimode" });

let adminContext: BrowserContext;
test.beforeAll(async ({browser})=>{
  adminContext = await browser.newContext({storageState: "playwright/.auth/admin.json"});
});
test.afterAll(async ()=>{ await adminContext.close(); });

/** Register a fresh OAuth client (as admin); returns the create response incl. client_secret. */
async function registerClient(redirectUri: string, {confidential = true}: {confidential?: boolean} = {}){
  const name = `e2e-oauth-${randomBytes(5).toString("hex")}`;
  const res = await adminContext.request.post("/auth/oauth/clients", {
    data: {name, redirect_uris: [redirectUri], confidential},
  });
  expect(res.ok(), `client registration failed: ${res.status()}`).toBeTruthy();
  return await res.json() as {id: number, name: string, client_secret: string | null};
}

function pkce(){
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return {verifier, challenge};
}

function authorizePath(clientId: number, challenge: string, redirectUri: string, opts: {scope?: string, state?: string, prompt?: string} = {}){
  const p = new URLSearchParams({
    response_type: "code",
    client_id: String(clientId),
    redirect_uri: redirectUri,
    scope: opts.scope ?? "all",
    state: opts.state ?? "e2e-state",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if(opts.prompt) p.set("prompt", opts.prompt);
  return `/auth/oauth/authorize?${p.toString()}`;
}

// The callback is recognizable by the OAuth response params, which the authorize
// *request* URL never carries (it has `code_challenge`, not `code`).
const arrivedAtCallback = (u: URL) => u.searchParams.has("code") || u.searchParams.has("error");

/** Log `page` in as a freshly created user (cookie lands in the page's context). */
async function loginFreshUser(page: Page, uniqueAccount: (level?: "use"|"create"|"admin")=>Promise<{username:string,password:string,uid:number}>){
  const account = await uniqueAccount();
  const res = await page.request.post("/auth/login", {
    data: {username: account.username, password: account.password},
    headers: {"Content-Type": "application/json"},
  });
  expect(res.status()).toEqual(200);
  return account;
}

const callbackUri = (baseURL: string | undefined) => new URL("/auth/", baseURL).toString();

test("completes the authorization-code + PKCE flow; the issued token works", async ({page, baseURL, uniqueAccount})=>{
  const account = await loginFreshUser(page, uniqueAccount);
  const redirectUri = callbackUri(baseURL);
  const client = await registerClient(redirectUri);
  const {verifier, challenge} = pkce();

  // Consent page names the client and the requested scope.
  await page.goto(authorizePath(client.id, challenge, redirectUri, {scope: "all"}));
  await expect(page.getByRole("heading", {name: "titles.authorize"})).toBeVisible();
  await expect(page.getByText(client.name)).toBeVisible();
  await page.getByRole("button", {name: "labels.authorize"}).click();

  // Redirected to the callback with a code and the state echoed back.
  await page.waitForURL(arrivedAtCallback);
  const cbUrl = new URL(page.url());
  expect(cbUrl.searchParams.get("state")).toEqual("e2e-state");
  const code = cbUrl.searchParams.get("code");
  expect(code, "expected an authorization code").toBeTruthy();

  // The third party exchanges the code (client_secret_post) for a token.
  const tokenRes = await page.request.post("/auth/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code: code!,
      redirect_uri: redirectUri,
      client_id: String(client.id),
      client_secret: client.client_secret!,
      code_verifier: verifier,
    },
  });
  expect(tokenRes.status()).toEqual(200);
  const tok = await tokenRes.json();
  expect(tok).toHaveProperty("token_type", "Bearer");
  expect(tok).toHaveProperty("scope", "all");
  expect(tok.access_token).toMatch(/^ecorpus_/);

  // The Bearer token authenticates an API call as the consenting user.
  const me = await page.request.get("/auth/", {headers: {Authorization: `Bearer ${tok.access_token}`}});
  expect(me.status()).toEqual(200);
  expect(await me.json()).toMatchObject({username: account.username, level: "create"});
});

test("an anonymous user is bounced to the login page", async ({page, baseURL})=>{
  const redirectUri = callbackUri(baseURL);
  const client = await registerClient(redirectUri);
  const {challenge} = pkce();
  await page.goto(authorizePath(client.id, challenge, redirectUri));
  await page.waitForURL(/\/auth\/login/);
  // The original authorize request is preserved as the post-login redirect.
  expect(decodeURIComponent(page.url())).toContain("/auth/oauth/authorize");
});

test("denying consent reports access_denied to the client", async ({page, baseURL, uniqueAccount})=>{
  await loginFreshUser(page, uniqueAccount);
  const redirectUri = callbackUri(baseURL);
  const client = await registerClient(redirectUri);
  const {challenge} = pkce();

  await page.goto(authorizePath(client.id, challenge, redirectUri));
  await page.getByRole("button", {name: "labels.deny"}).click();

  await page.waitForURL(arrivedAtCallback);
  const url = new URL(page.url());
  expect(url.searchParams.get("error")).toEqual("access_denied");
  expect(url.searchParams.get("code")).toBeNull();
});

test("a returning user renews silently — no consent page the second time", async ({page, baseURL, uniqueAccount})=>{
  await loginFreshUser(page, uniqueAccount);
  const redirectUri = callbackUri(baseURL);
  const client = await registerClient(redirectUri);

  // First time: interactive consent.
  await page.goto(authorizePath(client.id, pkce().challenge, redirectUri));
  await page.getByRole("button", {name: "labels.authorize"}).click();
  await page.waitForURL(arrivedAtCallback);

  // Second time: a covering grant exists → the authorize request redirects
  // straight to the callback with a code (goto follows the 302), no consent UI.
  await page.goto(authorizePath(client.id, pkce().challenge, redirectUri));
  expect(new URL(page.url()).searchParams.get("code"), "renewal should yield a fresh code").toBeTruthy();
});

test("prompt=consent forces the consent page even with a standing grant", async ({page, baseURL, uniqueAccount})=>{
  await loginFreshUser(page, uniqueAccount);
  const redirectUri = callbackUri(baseURL);
  const client = await registerClient(redirectUri);

  await page.goto(authorizePath(client.id, pkce().challenge, redirectUri));
  await page.getByRole("button", {name: "labels.authorize"}).click();
  await page.waitForURL(arrivedAtCallback);

  // Despite the grant, prompt=consent re-renders the page rather than redirecting.
  await page.goto(authorizePath(client.id, pkce().challenge, redirectUri, {prompt: "consent"}));
  await expect(page.getByRole("heading", {name: "titles.authorize"})).toBeVisible();
});

test("prompt=none without a grant reports consent_required", async ({page, baseURL, uniqueAccount})=>{
  await loginFreshUser(page, uniqueAccount);
  const redirectUri = callbackUri(baseURL);
  const client = await registerClient(redirectUri);

  await page.goto(authorizePath(client.id, pkce().challenge, redirectUri, {prompt: "none"}));
  expect(new URL(page.url()).searchParams.get("error")).toEqual("consent_required");
});

test("the consent page shows a restricted scope, which the token carries", async ({page, baseURL, uniqueAccount})=>{
  await loginFreshUser(page, uniqueAccount);
  const redirectUri = callbackUri(baseURL);
  const client = await registerClient(redirectUri);
  const {verifier, challenge} = pkce();

  await page.goto(authorizePath(client.id, challenge, redirectUri, {scope: "scenes:read"}));
  await expect(page.getByText("scenes:read")).toBeVisible();
  await page.getByRole("button", {name: "labels.authorize"}).click();
  await page.waitForURL(arrivedAtCallback);

  const tokenRes = await page.request.post("/auth/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code: new URL(page.url()).searchParams.get("code")!,
      redirect_uri: redirectUri,
      client_id: String(client.id),
      client_secret: client.client_secret!,
      code_verifier: verifier,
    },
  });
  expect(tokenRes.status()).toEqual(200);
  expect(await tokenRes.json()).toHaveProperty("scope", "scenes:read");
});

test("a public client completes the flow with PKCE and no secret", async ({page, baseURL, uniqueAccount})=>{
  await loginFreshUser(page, uniqueAccount);
  const redirectUri = callbackUri(baseURL);
  const client = await registerClient(redirectUri, {confidential: false});
  expect(client.client_secret).toBeNull();
  const {verifier, challenge} = pkce();

  await page.goto(authorizePath(client.id, challenge, redirectUri));
  await page.getByRole("button", {name: "labels.authorize"}).click();
  await page.waitForURL(arrivedAtCallback);

  // No client_secret in the exchange — PKCE alone authenticates the public client.
  const tokenRes = await page.request.post("/auth/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code: new URL(page.url()).searchParams.get("code")!,
      redirect_uri: redirectUri,
      client_id: String(client.id),
      code_verifier: verifier,
    },
  });
  expect(tokenRes.status()).toEqual(200);
  expect(await tokenRes.json()).toHaveProperty("access_token");
});
