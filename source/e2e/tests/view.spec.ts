import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { test, expect } from '../fixtures.js';
import type { Page } from "@playwright/test";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as user
test.use({ storageState: 'playwright/.auth/user.json' });
test.describe.configure({ mode: 'serial' });

let scenePage: Page;

const name = randomUUID();

test.beforeAll(async ({request, browser})=>{
  let res = await request.fetch(`/scenes/${encodeURIComponent(name)}`, {
    method: "MKCOL"
  });
  await expect(res).toBeOK();

  
  
  res = await request.put(`/scenes/${encodeURIComponent(name)}/models/cube.glb`,{
    data: await fs.readFile(path.join(fixtures, "cube.glb")),
    headers: {"Content-Type": "model/gltf-binary"}
  });
  await expect(res).toBeOK();

  res = await request.put(`/scenes/${encodeURIComponent(name)}/scene.svx.json`, {
    data: await fs.readFile(path.join(fixtures, "scene.svx.json")),
    headers: {"Content-Type": "application/json"}
  });
  await expect(res).toBeOK();

  res = await request.put(`/scenes/${encodeURIComponent(name)}/articles/new-article-OKiTjtY6zrbJ-EN.html`, {
    data: await fs.readFile(path.join(fixtures, "new-article-OKiTjtY6zrbJ-EN.html")),
    headers: {"Content-Type": "text/plain"}
  });
  await expect(res).toBeOK();

  scenePage = await browser.newPage();
  await scenePage.goto(`/ui/scenes/${name}/view?prompt=false`);
});


test.afterAll(async () => {
  await scenePage.close();
});

test("can show annotations", async ()=>{
  const short = scenePage.getByRole("button", {name:"annotation"}).getByText("Short Annotation");
  await expect(short).not.toBeVisible();
  await scenePage.getByTitle("Show/Hide Annotations").click();
  await expect(short).toBeVisible();

  // The "Link annotation" entry has an articleId, so opening it must
  // expose a "Read more" action somewhere in the explorer overlay.
  // Fixture spelling is "Link annotation" with a lowercase 'a'.
  await scenePage.getByRole("button", {name:"annotation"}).getByText("Link annotation").click();
  await expect(scenePage.getByRole('button', { name: /read more/i })).toBeVisible();
});