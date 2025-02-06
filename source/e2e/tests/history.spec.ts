import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { test, expect, Page } from '@playwright/test';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as user
test.use({ storageState: 'playwright/.auth/user.json', locale: "cimode" });
test.describe.configure({ mode: 'serial' });

let scenePage: Page;

const name = randomUUID();


let initial_doc :string;
/**
 * Tests in this suite are run in serial mode with no page reload, unless otherwise specified
 */
test.beforeAll(async ({request, browser})=>{
  //Create a scene
  let res = await request.post(`/scenes/${encodeURIComponent(name)}?language=FR`, {
    data: await fs.readFile(path.join(fixtures, "cube.glb")),
    headers: {"Content-Type": "model/gltf-binary"}
  });
  await expect(res).toBeOK();

  res = await request.get(`/scenes/${encodeURIComponent(name)}/scene.svx.json`);
  initial_doc = await res.text();

  expect(initial_doc).toBeTruthy();
  expect(initial_doc.slice(0,1)).toEqual("{"); //Checks that it appears to be JSON...

  //Make a bunch of changes
  res = await request.put(`/scenes/${encodeURIComponent(name)}/articles/new-article-OKiTjtY6zrbJ-EN.html`, {
    data: await fs.readFile(path.join(fixtures, "new-article-OKiTjtY6zrbJ-EN.html")),
    headers: {"Content-Type": "text/html"}
  });
  await expect(res).toBeOK();

  res = await request.put(`/scenes/${encodeURIComponent(name)}/scene.svx.json`, {
    data: await fs.readFile(path.join(fixtures, "scene.svx.json")),
    headers: {"Content-Type": "application/json"}
  });
  await expect(res).toBeOK();


  scenePage = await browser.newPage();
  await scenePage.goto(`/ui/scenes/${name}`);
});


test.afterAll(async () => {
  await scenePage.close();
});


test("can navigate to history page", async ()=>{
  await scenePage.getByRole("link", {name: "buttons.history"}).click();
  await scenePage.waitForURL(`/ui/scenes/${name}/history`);
  
});
