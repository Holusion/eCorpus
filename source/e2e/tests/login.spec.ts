


import path from "node:path";
import fs, { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

import { test, expect, Page, BrowserContext } from '@playwright/test';

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
      isAdministrator: false,
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

["/ui/", "/auth/login"].forEach((path)=>{
  
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
        "default": "none",
        "any": "none",
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
