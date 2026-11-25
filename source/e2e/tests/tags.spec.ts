import { randomUUID } from "node:crypto";

import { test, expect } from '../fixtures.js';
import type { BrowserContext, Page } from "@playwright/test";


//Authenticated as user
test.use({ storageState: 'playwright/.auth/user.json', cimode: true });

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
test("hitting enter in the batch tag field adds the tag to the selection", async ({page, request, createScene})=>{
  const name = await createScene();
  const tag = randomUUID();
  await page.goto(`/ui/scenes?match=${name}`);
  const card = page.locator(".scene-card").filter({hasText: name});
  await expect(card).toHaveCount(1);
  await card.locator(`input[type="checkbox"][name="id"]`).check();

  await page.getByTitle("buttons.showActions").click();
  const tagInput = page.locator("#tag-name");
  await tagInput.fill(tag);
  await tagInput.press("Enter");

  // The page must stay put with its selection untouched
  await expect(page.getByText(`Tag ${tag} was created`)).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/ui/scenes\\?match=${name}$`));
  await expect(card.locator(`input[type="checkbox"][name="id"]`)).toBeChecked();

  const res = await request.get(`/scenes/${encodeURIComponent(name)}`);
  await expect(res).toBeOK();
  expect((await res.json()).tags).toContain(tag);
});
