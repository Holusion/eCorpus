import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { test, expect } from '../fixtures.js';
import type { Page } from "@playwright/test";

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

test("history page lists entries for the seeded edits", async ()=>{
  // beforeAll PUTs scene.svx.json and a new article on top of the initial POST,
  // so history must contain at least the article and the svx revisions.
  const entries = scenePage.getByRole("treeitem");
  await expect(entries.first()).toBeVisible();
  expect(await entries.count()).toBeGreaterThanOrEqual(1);

  const list = scenePage.locator(".history-list");
  await expect(list).toContainText("scene.svx.json");
  await expect(list).toContainText("new-article-OKiTjtY6zrbJ-EN.html");
});

test("history page exposes a preview link for each entry", async ()=>{
  // Eye-icon links carry the translated aria-label; under cimode this is the i18n key.
  const previews = scenePage.getByRole("link", { name: "info.viewAtThisPoint" });
  expect(await previews.count()).toBeGreaterThan(0);
  const first = previews.first();
  await expect(first).toBeVisible();
  // href is relative to /ui/scenes/{name}/history → /ui/scenes/{name}/history/{id}/view
  const href = await first.getAttribute("href");
  expect(href).toMatch(/^history\/\d+\/view$/);
});

test("preview link opens a viewer scoped to the historical revision", async ({request})=>{
  const previews = scenePage.getByRole("link", { name: "info.viewAtThisPoint" });
  const href = await previews.first().getAttribute("href");
  const id = href!.match(/^history\/(\d+)\/view$/)![1];

  // Navigate via the icon so we exercise the actual UI path.
  await previews.first().click();
  await scenePage.waitForURL(`/ui/scenes/${name}/history/${id}/view`);

  // The viewer template wires Voyager to the historical show route.
  const explorer = scenePage.locator("voyager-explorer");
  await expect(explorer).toHaveAttribute("root", `/history/${name}/${id}/show/`);
  await expect(scenePage).toHaveTitle(`eCorpus: History of ${name}`);

  // Verify the document at that point in time loads cleanly and carries the
  // expected scene title from the fixture (metas[*].collection.titles.EN).
  const res = await request.get(`/history/${encodeURIComponent(name)}/${id}/show/scene.svx.json`);
  await expect(res).toBeOK();
  const doc = await res.json();
  const titles = (doc.metas as Array<any>).map(m => m?.collection?.titles?.EN).filter(Boolean);
  expect(titles).toContain("cube_test");

  // Models referenced by the historical document must also be served by the show route.
  const modelRes = await request.get(`/history/${encodeURIComponent(name)}/${id}/show/models/cube.glb`);
  await expect(modelRes).toBeOK();
  expect(modelRes.headers()["content-type"]).toMatch(/gltf|octet-stream/);

  await scenePage.goBack();
  await scenePage.waitForURL(`/ui/scenes/${name}/history`);
});
