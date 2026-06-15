import { test, expect } from '../fixtures.js';
import type { BrowserContext, Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";

// The personal-access-token UI and the "Authorized applications" (OAuth grants)
// section, both on /ui/user/tokens.
// Runs unauthenticated by default; each test logs a fresh user in.
test.use({ storageState: { cookies: [], origins: [] }, locale: "cimode" });

let adminContext: BrowserContext;
test.beforeAll(async ({browser})=>{
  adminContext = await browser.newContext({storageState: "playwright/.auth/admin.json"});
});
test.afterAll(async ()=>{ await adminContext.close(); });

async function loginFreshUser(page: Page, uniqueAccount: (level?: "use"|"create"|"admin")=>Promise<{username:string,password:string,uid:number}>){
  const account = await uniqueAccount();
  const res = await page.request.post("/auth/login", {
    data: {username: account.username, password: account.password},
    headers: {"Content-Type": "application/json"},
  });
  expect(res.status()).toEqual(200);
  return account;
}

test("creates a personal token shown once, usable as Bearer, then revocable", async ({page, uniqueAccount})=>{
  const account = await loginFreshUser(page, uniqueAccount);
  const tokenName = `e2e-tok-${randomBytes(4).toString("hex")}`;

  await page.goto("/ui/user/tokens");
  await page.locator("#token-name").fill(tokenName);
  // The "all" scope is selected by default.
  await page.getByRole("button", {name: "labels.create"}).click();

  // The secret is revealed exactly once.
  await expect(page.locator("#token-secret")).toBeVisible();
  const token = (await page.locator("#token-secret-value").innerText()).trim();
  expect(token).toMatch(/^ecorpus_/);

  // It is listed (personal tokens have no client → "—").
  const row = page.locator("#token-list").getByRole("row", {name: new RegExp(tokenName)});
  await expect(row).toBeVisible();
  await expect(row).toContainText("all");

  // The token authenticates an API call as its owner.
  let me = await page.request.get("/auth/", {headers: {Authorization: `Bearer ${token}`}});
  expect(me.status()).toEqual(200);
  expect(await me.json()).toMatchObject({username: account.username});

  // Revoke it from the list; the row disappears and the token stops working.
  await row.getByRole("button", {name: "labels.revoke"}).click();
  await expect(page.locator("#token-list").getByRole("row", {name: new RegExp(tokenName)})).toHaveCount(0);
  me = await page.request.get("/auth/", {headers: {Authorization: `Bearer ${token}`}});
  expect(me.status()).toEqual(401);
});

test("creates a scope-restricted token via the scope picker", async ({page, uniqueAccount})=>{
  await loginFreshUser(page, uniqueAccount);
  const tokenName = `e2e-scoped-${randomBytes(4).toString("hex")}`;

  await page.goto("/ui/user/tokens");
  await page.locator("#token-name").fill(tokenName);
  await page.locator("#token-scope").selectOption(["scenes:read"]);
  await page.getByRole("button", {name: "labels.create"}).click();

  await expect(page.locator("#token-secret")).toBeVisible();
  const row = page.locator("#token-list").getByRole("row", {name: new RegExp(tokenName)});
  await expect(row).toBeVisible();
  await expect(row).toContainText("scenes:read");
  await expect(row).not.toContainText("all");
});

test("lists an authorized application and revokes its access", async ({page, baseURL, uniqueAccount})=>{
  const account = await loginFreshUser(page, uniqueAccount);

  // Register a client and have the user consent (persisting a grant + a token).
  // The redirect URI is a lightweight same-origin endpoint standing in for the
  // third-party callback (see oauth_flow.spec.ts for the rationale).
  const redirectUri = new URL("/auth/", baseURL).toString();
  const clientName = `e2e-app-${randomBytes(4).toString("hex")}`;
  const reg = await adminContext.request.post("/auth/oauth/clients", {
    data: {name: clientName, redirect_uris: [redirectUri]},
  });
  expect(reg.ok()).toBeTruthy();
  const client = await reg.json() as {id: number, client_secret: string};

  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const q = new URLSearchParams({
    response_type: "code", client_id: String(client.id), redirect_uri: redirectUri,
    scope: "all", state: "x", code_challenge: challenge, code_challenge_method: "S256",
  });
  await page.goto(`/auth/oauth/authorize?${q}`);
  await page.getByRole("button", {name: "labels.authorize"}).click();
  await page.waitForURL(u => u.searchParams.has("code"));
  const code = new URL(page.url()).searchParams.get("code")!;
  const tokenRes = await page.request.post("/auth/oauth/token", {
    form: {grant_type: "authorization_code", code, redirect_uri: redirectUri,
      client_id: String(client.id), client_secret: client.client_secret, code_verifier: verifier},
  });
  const accessToken = (await tokenRes.json()).access_token as string;

  // The app appears under "Authorized applications".
  await page.goto("/ui/user/tokens");
  const grantRow = page.locator("#grant-list").getByRole("row", {name: new RegExp(clientName)});
  await expect(grantRow).toBeVisible();

  // Sanity: the OAuth token works before revocation.
  expect((await page.request.get("/auth/", {headers: {Authorization: `Bearer ${accessToken}`}})).status()).toEqual(200);

  // Revoke the grant: the row goes away and the client's token is revoked.
  await grantRow.getByRole("button", {name: "labels.revoke"}).click();
  await expect(page.locator("#grant-list").getByRole("row", {name: new RegExp(clientName)})).toHaveCount(0);
  expect((await page.request.get("/auth/", {headers: {Authorization: `Bearer ${accessToken}`}})).status()).toEqual(401);
});
