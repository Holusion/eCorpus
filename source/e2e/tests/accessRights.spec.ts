import path from "node:path";
import fs, { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

import { test, expect } from '../fixtures';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");


//Runs with a per-test storageState, in locale "cimode"
test.use({ storageState: { cookies: [], origins: [] }, locale: "cimode" });

//The _actual_ route access rights are tested in unit tests
//We want to have the user properly informed and that's what we're testing here

test("can't create a new scene", async function({page, request}){
  const name = randomUUID();
  
  await page.goto("/ui/upload/");
  const f = page.getByRole("form", {name: "titles.createScene"});
  await expect(f).toBeVisible();
  await f.getByRole("button", {name: "labels.selectFile"}).setInputFiles(path.join(fixtures, "cube.glb"));
  await f.getByRole("textbox", {name: "labels.sceneTitle"}).fill(name);
  await f.getByRole("button", {name: "buttons.upload"}).click();
  
  await expect(page.getByRole("status").getByText("Unauthorized")).toBeVisible();

  let res = await request.get(`/scenes/${name}`);
  await expect(res).not.toBeOK();
});



test("can't upload a zip", async function({page, userPage}){
  const name = randomUUID();
  let res = await userPage.request.post(`/scenes/${name}`,{
    data: await fs.readFile(path.join(fixtures, "cube.glb")),
  });
  await expect(res).toBeOK();
  res = await userPage.request.get(`/scenes/${name}`, {
    headers: {
      "Accept": "application/zip",
    }
  });

  let body = await res.body();
  await page.goto("/ui/upload/");
  const f = page.getByRole("form", {name: "titles.createScene"});
  await expect(f).toBeVisible();
  await f.getByRole("button", {name: "labels.selectFile"}).setInputFiles({
    name: "scene.zip",
    mimeType: "application/zip",
    buffer: body,
  });

  await f.getByRole("button", {name: "buttons.upload"}).click();
  
  await expect(page.getByText("Unauthorized", {exact: true})).toBeVisible();
});
