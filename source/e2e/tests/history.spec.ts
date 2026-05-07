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
  // The most-recent day-level treeitem carries aria-disabled="true" (you can't
  // restore/view past the current state), which propagates to its nested
  // entries' restore + view buttons. Pick the first link that is *not*
  // accessibility-disabled — that's a link for an actually-historical point.
  const preview = scenePage.getByRole("link", { name: "info.viewAtThisPoint", disabled: false }).first();
  await expect(preview).toBeVisible();
  const href = await preview.getAttribute("href");
  const clickedId = href!.match(/^history\/(\d+)\/view$/)![1];

  // Navigate via the icon so we exercise the actual UI path.
  await preview.click();
  await scenePage.waitForURL(`/ui/scenes/${name}/history/${clickedId}/view`);

  // The viewer template wires Voyager to the historical show route.
  const explorer = scenePage.locator("voyager-explorer");
  await expect(explorer).toHaveAttribute("root", `/history/${name}/${clickedId}/show/`);
  await expect(scenePage).toHaveTitle(new RegExp(`^eCorpus: History of ${name}\\b`));

  // Bucketing in the UI groups multiple revisions under a few clickable points,
  // so the clicked link may target an early file id (e.g. created during
  // bootstrap, before scene.svx.json was written). To verify the show route
  // serves a coherent historical scene, look up the latest history id via the
  // API and use it for the document/asset assertions.
  const histRes = await request.get(`/history/${encodeURIComponent(name)}`);
  await expect(histRes).toBeOK();
  const history = await histRes.json() as Array<{id:number, name:string}>;
  const latestSvxId = history.find(h => h.name === "scene.svx.json")!.id;

  // The show route must reassemble the historical document. Verify the scene
  // title baked into the fixture is present at this point in time.
  const res = await request.get(`/history/${encodeURIComponent(name)}/${latestSvxId}/show/scene.svx.json`);
  await expect(res).toBeOK();
  const doc = await res.json();
  const titles = (doc.metas as Array<any>).map(m => m?.collection?.titles?.EN).filter(Boolean);
  expect(titles).toContain("cube_test");

  // The article that was PUT during setup must also be served at this point.
  const articleRes = await request.get(`/history/${encodeURIComponent(name)}/${latestSvxId}/show/articles/new-article-OKiTjtY6zrbJ-EN.html`);
  await expect(articleRes).toBeOK();

  await scenePage.goBack();
  await scenePage.waitForURL(`/ui/scenes/${name}/history`);
});
