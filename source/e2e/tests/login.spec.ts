


import path from "node:path";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

import { test, expect } from '../fixtures.js';
import type { BrowserContext } from "@playwright/test";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Runs unauthenticated, in locale "cimode"
test.use({ storageState: { cookies: [], origins: [] }, locale: "cimode" });

let username: string;
let password: string;
let userId :number;

let adminContext :BrowserContext;

test.beforeAll(async ({browser})=>{
  adminContext = await browser.newContext({storageState: "playwright/.auth/admin.json"});

  username = `testUserLogin${randomBytes(2).readUInt16LE().toString(36)}`;
  password = randomBytes(16).toString("base64");
  
  //Create a user for this specific test suite
  let res = await  adminContext.request.post("/users", {
    data: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password,
      level: "create",
    }),
    headers:{
      "Content-Type": "application/json",
    }
  });
  let body = JSON.parse(await res.text());
  expect(body).toHaveProperty("uid");
  userId = body.uid;
});

test.afterAll(async ()=>{
  await adminContext.close();
});

["/auth/login"].forEach((path)=>{
  
  test(`can login through ${path}`, async ({page})=>{
  await page.goto(path);

  let userSettingsLink = page.getByRole("link", {name: username}); 
  await expect(userSettingsLink).not.toBeVisible();

  await page.getByRole("textbox", {name: "labels.username"}).fill(username);

  await page.getByRole("textbox", {name: "labels.password"}).fill(password);

  await page.getByRole("button", {name: "labels.signin"}).click();
  await page.waitForURL("/ui/");
  await expect(userSettingsLink).toBeVisible();
  });

  test(`can fail to login through ${path} (bad password)`, async ({page})=>{
    await page.goto(path);
      
    let userSettingsLink = page.getByRole("link", {name: username}); 
    await expect(userSettingsLink).not.toBeVisible();

    await page.getByRole("textbox", {name: "labels.username"}).fill(username);

    await page.getByRole("textbox", {name: "labels.password"}).fill("not-password");

    await page.getByRole("button", {name: "labels.signin"}).click();

    await expect(page.getByRole("alert")).toHaveText("errors.Bad password");
  });
});

test(`can login from a private page`, async ({page, request})=>{
  // The idea is you're shown a 404 when trying to access a private scene.
  // From there you should be able to login and end-up where you initially requested
  
  // So we create a scene
  let sceneName = randomUUID();
  let res = await adminContext.request.post(`/scenes/${sceneName}`, {
    data: await readFile(path.join(fixtures, "cube.glb")),
    headers:{
      "Content-Type": "model/gltf-binary",
    }
  });
  await expect(res).toBeOK();

  // We patch the scene so it is NOT world-readable
  res = await adminContext.request.patch(`/scenes/${sceneName}`, {
    data: {
      permissions: {
        [username]: "write",
      }
    }
  });
  await expect(res).toBeOK();

  //Check that we can't access the scene
  let pageRes = await page.goto(`/ui/scenes/${sceneName}/edit`);
  expect(pageRes).toBeTruthy();
  expect(pageRes!.status()).toEqual(404);

  await page.getByRole("link", {name:"nav.login"}).click();
  await page.waitForURL(/\/auth\/login/);
  await page.getByRole("textbox", {name: "labels.username"}).fill(username);
  await page.getByRole("textbox", {name: "labels.password"}).fill(password);
  await page.getByRole("button", {name: "labels.signin"}).click();
  await page.waitForURL(`/ui/scenes/${sceneName}/edit`);
  await expect(page.getByRole("heading", {name: sceneName})).toBeVisible();
  await expect(page.getByText('VScene', {exact: true})).toBeVisible();
});


test(`can login with an authenticated link`, async ({page, request})=>{
  let res = await adminContext.request.get(`/auth/login/${username}/link`);
  await expect(res).toBeOK();
  let authLink = await res.text();

  await page.setContent(`<!DOCTYPE html><html><body>
    <a href="${authLink}">connect link</a>
  </body></html>`)
  await page.getByRole("link").click();
  let userSettingsLink = page.getByRole("link", {name: username});
  await expect(userSettingsLink).toBeVisible();
});

// We can't actually expire or rotate keys from outside the server, but we can
// exercise the negative paths the auth-link consumer is supposed to reject.

test(`refuses an auth link with a tampered signature`, async ({page})=>{
  let res = await adminContext.request.get(`/auth/login/${username}/link`);
  await expect(res).toBeOK();
  const authLink = await res.text();

  // Flip a single character in the signature segment (everything before the
  // first '.' in the /auth/payload/<sig>.<data> path).
  const url = new URL(authLink);
  const m = url.pathname.match(/^\/auth\/payload\/([^.]+)\.(.+)$/);
  expect(m, `unexpected auth link shape: ${url.pathname}`).toBeTruthy();
  const sig = m![1];
  const data = m![2];
  const flipped = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  url.pathname = `/auth/payload/${flipped}.${data}`;

  const followRes = await page.goto(url.toString());
  expect(followRes?.status()).toEqual(403);

  // And no session was minted: hitting an authenticated endpoint stays anonymous.
  const me = await page.request.get(`/auth/login`);
  expect(me).toBeOK();
  expect(await me.json()).toHaveProperty("level", "none");
});

test(`refuses an auth link whose user has been deleted`, async ({page})=>{
  // Use a throwaway user so we don't disturb the shared one used by sibling tests.
  const ephemeral = `testUserEphemeral${randomBytes(2).readUInt16LE().toString(36)}`;
  const create = await adminContext.request.post("/users", {
    data: JSON.stringify({
      username: ephemeral,
      email: `${ephemeral}@example.com`,
      password: randomBytes(16).toString("base64"),
      level: "create",
    }),
    headers:{ "Content-Type": "application/json" }
  });
  await expect(create).toBeOK();
  const ephemeralId :number = (await create.json()).uid;

  const res = await adminContext.request.get(`/auth/login/${ephemeral}/link`);
  await expect(res).toBeOK();
  const authLink = await res.text();

  const del = await adminContext.request.delete(`/users/${ephemeralId}`);
  await expect(del).toBeOK();

  const followRes = await page.goto(authLink);
  // payload signature is valid but the user lookup fails -> 400.
  expect(followRes?.status()).toEqual(400);

  const me = await page.request.get(`/auth/login`);
  expect(me).toBeOK();
  expect(await me.json()).toHaveProperty("level", "none");
});
