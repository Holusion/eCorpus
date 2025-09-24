import { randomUUID } from "node:crypto";

import { test, expect } from '@playwright/test';
import type { BrowserContext, Page } from "@playwright/test";


//Authenticated as user
test.use({ storageState: 'playwright/.auth/user.json' });

let adminContext :BrowserContext;

test.beforeAll(async ({browser})=>{
  adminContext = await browser.newContext({storageState: "playwright/.auth/admin.json"});

});

test.afterAll(async ()=>{
  await adminContext.close();
});


test("can list tags matching a string", async ({page, request})=>{
  const sceneName = randomUUID();
  let res = await request.fetch(`/scenes/${encodeURIComponent(sceneName)}`, {
    method: "MKCOL"
  });
  await expect(res).toBeOK();
  res = await request.fetch(`/scenes/${encodeURIComponent(sceneName)}`, {
    method: "PATCH",
    data: {tags: [sceneName]}
  });
  await expect(res).toBeOK();
  await page.goto(`/ui/tags?match=${sceneName}`);
  await expect(page.getByRole("listitem", {name: sceneName})).toBeVisible();
});

test("can't list tags that are not readable", async ({page, request})=>{
  const sceneName = randomUUID();
  let res = await adminContext.request.fetch(`/scenes/${encodeURIComponent(sceneName)}`, {
    method: "MKCOL"
  });
  await expect(res).toBeOK();
  res = await adminContext.request.fetch(`/scenes/${encodeURIComponent(sceneName)}`, {
    method: "PATCH",
    data: {tags: [sceneName], public_access: "none", default_access: "none"}
  });
  await expect(res).toBeOK();

  await page.goto(`/ui/tags?match=${sceneName}`);
  await expect(page.getByRole("listitem", {name: sceneName})).not.toBeVisible();
});