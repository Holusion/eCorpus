import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { test, expect, Page } from '@playwright/test';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as user
test.use({ storageState: 'playwright/.auth/user.json' });
test.describe.configure({ mode: 'serial' });

let scenePage: Page;

const name = randomUUID();

/*
 * Tests in this suite are sequential : expect all side effects to propagate to following tests
 */

test.beforeAll(async ({request, browser})=>{
  //Create a scene in **FRENCH** to make sure the is no DEFAULT_LANGUAGE creep
  let res = await request.post(`/scenes/${encodeURIComponent(name)}?language=FR`,{
    data: await fs.readFile(path.join(fixtures, "cube.glb")),
    headers: {"Content-Type": "model/gltf-binary"}
  });
  await expect(res).toBeOK();
  scenePage = await browser.newPage();
  await scenePage.goto(`/ui/scenes/${name}/edit`);
});


test.afterAll(async () => {
  await scenePage.close();
});

test("shows voyager-story in french", async ()=>{
  await expect(scenePage.getByRole("button", {name: "FR"})).toBeVisible();
});

test("can select the model", async()=>{
  await scenePage.getByText('Cube', { exact: true }).click();
});

test("can create an annotation", async ()=>{
  await scenePage.getByRole("button", {name: "Annotations"}).click();

  await scenePage.getByRole('button', { name: 'Create' }).click();
  const vp = scenePage.viewportSize();
  await scenePage.mouse.click( vp!.width/1.75,  vp!.height/1.75);
  await expect(scenePage.getByLabel('annotation', { exact: true })).toBeVisible();
  await expect(scenePage.getByLabel('annotation', { exact: true })).toHaveText("New Annotation");

  //Still in french
  await expect(scenePage.getByRole("button", {name: "FR", exact: true})).toBeVisible();
});

test("can create an annotation in a secondary language", async ()=>{
  await scenePage.getByRole("button", {name: "Annotations"}).click();
  await scenePage.locator(".sv-task-view sv-property-options").filter({hasText: 'Language'}).getByRole("combobox").selectOption("1")// 1 is Spanish
  await expect(scenePage.getByRole("button", {name: "ES", exact: true})).toBeVisible();
  const vp = scenePage.viewportSize();
  
  
  await scenePage.mouse.click( vp!.width/1.1,  vp!.height/1.75); // click outside to deselect previous annotation before creating a new one
  await scenePage.getByRole('button', { name: 'Create' }).click();
  await scenePage.mouse.click( vp!.width/1.75,  vp!.height/2);
  await expect(scenePage.getByLabel('annotation', { exact: true })).toHaveCount(2);

  // Modify the default text
  await scenePage.locator('sv-property-string').filter({ hasText: 'Title' }).getByRole('textbox').fill("Spanish annotation");
  await scenePage.locator('sv-property-string').filter({ hasText: 'Title' }).getByRole('textbox').press("Enter");

  //Annotation is set and still in spanish
  await expect(scenePage.getByLabel('annotation', { exact: true }).filter({hasText:"Spanish annotation"})).toBeVisible();
  await expect(scenePage.getByRole("button", {name: "ES", exact: true})).toBeVisible();

  // Select French again, check that "Spanish annotation" is no longer there
  await scenePage.locator(".sv-task-view sv-property-options").filter({hasText: 'Language'}).getByRole("combobox").selectOption("5")// 5 is French
  await expect(scenePage.getByLabel('annotation', { exact: true }).filter({hasText:"Spanish annotation"})).toHaveCount(0);
  
});

test("can create an article", async ()=>{
  await scenePage.getByRole("button", {name: "Articles"}).click();

  await scenePage.getByRole('button', { name: 'Create' }).click();

  let mce = scenePage.locator('sv-article-editor').getByRole('application').locator("iframe").contentFrame();
  await expect(mce.getByRole("heading")).toHaveText("Nouvel Article");

  //Still in french
  await expect(scenePage.getByRole("button", {name: "FR", exact: true})).toBeVisible();

});

test("can switch to english to edit the article", async ()=>{
  await scenePage.locator(".sv-task-view").getByRole("combobox").selectOption("0")// 0 is English
  await expect(scenePage.getByRole("button", {name: "EN", exact: true})).toBeVisible();
  let mce = scenePage.locator('sv-article-editor').getByRole('application').locator("iframe").contentFrame();
  await expect(mce.getByRole("heading")).toHaveText("New Article");
})


test("can save the scene", async ()=>{
  await scenePage.locator(".sv-task-view").getByRole("combobox").selectOption("5")// 5 is French
  let mce = scenePage.locator('sv-article-editor').getByRole('application').locator("iframe").contentFrame();
  await expect(mce.getByRole("heading")).toHaveText("Nouvel Article");
  // Interface is still in english even if active language is in french. See rc-53
  //This locator should target role = "navigation" when this gets implemented
  await scenePage.locator("sv-task-bar").getByRole('button', { name: 'Save' }).click();
  // @fixme catch notification
  await expect(scenePage.getByText("Successfully uploaded file")).toBeVisible({timeout: 500});
});
