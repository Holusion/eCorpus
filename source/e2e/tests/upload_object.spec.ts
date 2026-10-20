import path from "node:path";
import { randomUUID } from "node:crypto";

import { test, expect } from '../fixtures.js';
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/user.json', locale: "cimode" });

/** Replace the localized entries of upload results, to cover what real models don't produce */
async function mockUploadReport(page: Page, report: { warnings?: object[], messages?: object[] }) {
  await page.route(/\/tasks\/\d+$/, async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    Object.assign(body.task.output, report);
    await route.fulfill({ response, json: body });
  });
}

test("shows a model report with localized warnings and recommendations", async ({ page }) => {
  await page.goto("/ui/upload");
  await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "cube_textured.glb"));
  const report = page.getByRole("status");
  await expect(report.getByRole("listitem")).toHaveText(["modelWarnings.png-images"]);
  await expect(report.getByText("modelWarnings.recommend-optimize", { exact: true })).toBeVisible();
  await page.getByTitle("remove upload").click();
  await expect(report).toHaveCount(0);
});

test("model report shows entries without a translation", async ({ page }) => {
  await mockUploadReport(page, {
    warnings: [{ key: "modelWarnings.png-images", message: "PNG!" }, { key: "future-model-warning" }],
    messages: [],
  });
  await page.goto("/ui/upload");
  await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "cube.glb"));
  const report = page.getByRole("status");
  await expect(report.getByRole("listitem")).toHaveText(["PNG!", "future-model-warning"]);
  await expect(report.getByRole("paragraph")).toHaveCount(0);
});

test("model report stays attached to each source file", async ({ page }) => {
  await page.goto("/ui/upload");
  const buffer = await readFile(path.join(fixtures, "cube_textured.glb"));
  await page.locator('input[type="file"]').setInputFiles([
    { name: "first.glb", mimeType: "model/gltf-binary", buffer },
    { name: "second.glb", mimeType: "model/gltf-binary", buffer },
  ]);
  const first = page.locator(".upload-line").filter({ hasText: "first.glb" });
  const second = page.locator(".upload-line").filter({ hasText: "second.glb" });
  for (const upload of [first, second]) {
    const report = upload.getByRole("status");
    await expect(report.getByText("modelWarnings.png-images", { exact: true })).toBeVisible();
    await expect(report.getByText("modelWarnings.recommend-optimize", { exact: true })).toBeVisible();
  }
  await first.getByTitle("remove upload").click();
  await expect(first).toHaveCount(0);
  await expect(second.getByRole("status")).toBeVisible();
});

test("model report applies localization for English and French requests", async ({ browser, baseURL }) => {
  const messages: string[] = [];
  for (const locale of ["en", "fr"]) {
    const context = await browser.newContext({ locale, baseURL, storageState: 'playwright/.auth/user.json' });
    try {
      const page = await context.newPage();
      await page.goto("/ui/upload");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "cube_textured.glb"));
      const warning = page.getByRole("status").getByRole("listitem");
      await expect(warning).toBeVisible();
      await expect(warning).toHaveText(/\S/);
      await expect(warning).not.toContainText("modelWarnings.");
      messages.push((await warning.innerText()).trim());
    } finally {
      await context.close();
    }
  }
  // A missing French translation falling back to English must also fail.
  expect(messages[1]).not.toEqual(messages[0]);
});

test("uploads and rename a glb", async ({ page, request }) => {
  await page.goto("/ui/upload");
  //We are forced to use the rename otherwise we'd have a name collision
  const name = randomUUID();
  await page.locator("input[type=\"file\"]").setInputFiles(path.join(fixtures, "cube.glb"));

  await expect(page.getByRole("listitem").getByText("✓")).toBeVisible();

  const f = page.getByRole("form", { name: "titles.createOrUpdateScene" });
  await expect(f).toBeVisible();
  await expect(f.getByRole("combobox", { name: "labels.setupLocalization" })).toHaveValue("en");
  await f.getByRole("textbox", { name: "labels.sceneName" }).fill(name);
  await page.getByRole("button", { name: "buttons.uploadScene" }).click();

  const uploads = page.getByRole("region", { name: "titles.createdScenes" });
  await expect(uploads).toBeVisible({ timeout: 10000 });
  //Don't check for actual progress bar visibility because that could be too quick to register
  const link = uploads.getByRole("link", { name: name });
  await link.click();
  await expect(page).toHaveURL(`/ui/scenes/${name}`);
  await expect(page.locator("h1")).toHaveText(name);

  let res = await request.get(`/scenes/${name}/scene.svx.json`);
  await expect(res).toBeOK();
  let doc = JSON.parse((await res.body()).toString());
  expect(doc).toHaveProperty("setups");
  expect(doc.setups).toHaveLength(1);
  expect(doc.setups[0]).toHaveProperty("language", { language: "EN" });


  res = await request.get(`/scenes/${name}/cube.glb`);
  await expect(res).toBeOK();
  expect(res.headers()).toHaveProperty("etag", '"4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs"');
});

test("uploads and rename a glb (force FR)", async ({ page, request }) => {
  await page.goto("/ui/upload");
  //We are forced to use the rename otherwise we'd have a name collision
  const name = randomUUID();
  await page.locator("input[type=\"file\"]").setInputFiles(path.join(fixtures, "cube.glb"));

  await expect(page.getByRole("listitem").getByText("✓")).toBeVisible();

  const f = page.getByRole("form", { name: "titles.createOrUpdateScene" });
  const uploads = page.getByRole("region", { name: "titles.createdScenes" });

  await expect(f).toBeVisible();
  await expect(uploads).not.toBeVisible();

  await f.getByRole("combobox", { name: "labels.setupLocalization" }).selectOption("fr");
  await f.getByRole("textbox", { name: "labels.sceneName" }).fill(name);

  await page.getByRole("button", { name: "buttons.uploadScene" }).click();

  await expect(uploads).toBeVisible();
  //Don't check for actual progress bar visibility because that could be too quick to register
  const link = uploads.getByRole("link", { name: name });
  await link.click();
  await expect(page).toHaveURL(`/ui/scenes/${name}`);
  await expect(page.locator("h1")).toHaveText(name);

  let res = await request.get(`/scenes/${name}/scene.svx.json`);
  await expect(res).toBeOK();
  let doc = JSON.parse((await res.body()).toString());
  expect(doc).toHaveProperty("setups");
  expect(doc.setups).toHaveLength(1);
  expect(doc.setups[0]).toHaveProperty("language", { language: "FR" });


  res = await request.get(`/scenes/${name}/cube.glb`);
  await expect(res).toBeOK();
  expect(res.headers()).toHaveProperty("etag", '"4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs"');
});


test("upload many glb", async ({ page, request }) => {
  await page.goto("/ui/upload");

  const name = randomUUID();
  const content = await readFile(path.join(fixtures, "cube.glb"));

  let files: {
    name: string;
    mimeType: string;
    buffer: Buffer;
  }[] = [];

  for (let i = 0; i < 10; i++) {
    const buffer = Buffer.from(content);
    files.push({
      name: randomUUID() + ".glb",
      mimeType: "model/gltf-binary",
      buffer,
    })
  }

  const section = page.locator("section");
  //Check that we can actually open the filechooser by clicking on the button
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByText("labels.selectFile_s").click();
  const fileChooser = await fileChooserPromise;
  fileChooser.setFiles(files);

  //Don't check for actual progress bar visibility because that could be too quick to register
  //Just wait for all files to be done
  for (let file of files) {
    await expect(page.locator(`#upload-${file.name.replace(/[^-_a-z0-9]/g, "_")}.upload-done`)).toBeVisible();
  }

  const f = section.getByRole("form", { name: "titles.createOrUpdateScene" });
  const btn = section.getByRole("button", { name: "buttons.uploadScene" });
  await expect(f).toBeVisible();
  await expect(btn).toBeVisible();
  await btn.scrollIntoViewIfNeeded();

  await f.getByRole("textbox", { name: "labels.sceneName" }).fill(name);
  await f.getByRole("combobox", { name: "labels.setupLocalization" }).selectOption("fr");

  //Submit
  await btn.click();

  const uploads = page.getByRole("region", { name: "titles.createdScenes" });
  await expect(uploads).toBeVisible();
  const link = uploads.getByRole("link", { name: name });
  await link.click();
  await expect(page).toHaveURL(`/ui/scenes/${name}`);
  await expect(page.locator("h1")).toHaveText(name);

  let res = await request.get(`/scenes/${name}/scene.svx.json`);
  await expect(res).toBeOK();
  let doc = JSON.parse((await res.body()).toString());
  expect(doc).toHaveProperty("setups");
  expect(doc.setups).toHaveLength(1);
  expect(doc.setups[0]).toHaveProperty("language", { language: "FR" });
  expect(doc.models).toHaveProperty("length", files.length);

  for (let file of files) {
    res = await request.get(`/scenes/${name}/${file.name}`);
    await expect(res).toBeOK();
    expect(res.headers()).toHaveProperty("etag", '"4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs"');
  }

});

test("uploads an obj with mtl and texture", async ({ page, request }) => {
  await page.goto("/ui/upload");
  //We are forced to use the rename otherwise we'd have a name collision
  const name = randomUUID();
  await page.locator("input[type=\"file\"]").setInputFiles([
    path.join(fixtures, "cube.obj"),
    path.join(fixtures, "cube.mtl"),
    path.join(fixtures, "Diffuse.jpg"),
  ]);

  await expect(page.getByRole("listitem").getByText("✓")).toHaveCount(3);

  const f = page.getByRole("form", { name: "titles.createOrUpdateScene" });
  await expect(f).toBeVisible();
  await expect(f.getByRole("combobox", { name: "labels.setupLocalization" })).toHaveValue("en");
  await f.getByRole("textbox", { name: "labels.sceneName" }).fill(name);
  await page.getByRole("button", { name: "buttons.uploadScene" }).click();

  const uploads = page.getByRole("region", { name: "titles.createdScenes" });
  await expect(uploads).toBeVisible();
  //Don't check for actual progress bar visibility because that could be too quick to register
  const link = uploads.getByRole("link", { name: name });
  await link.click();
  await expect(page).toHaveURL(`/ui/scenes/${name}`);
  await expect(page.locator("h1")).toHaveText(name);

  let res = await request.get(`/scenes/${name}/scene.svx.json`);
  await expect(res).toBeOK();
  let doc = JSON.parse((await res.body()).toString());

  expect(doc).toHaveProperty("setups");
  expect(doc.setups).toHaveLength(1);
  expect(doc.setups[0]).toHaveProperty("language", { language: "EN" });

  expect(doc).toHaveProperty("models");
  expect(doc.models).toHaveLength(1);
  expect(doc.models[0]).toHaveProperty("derivatives");
  expect(doc.models[0].derivatives).toEqual([{
    "assets": [{
      "byteSize": 3884,
      "imageSize": 96,
      "numFaces": 12,
      "type": "Model",
      "uri": "cube.glb"
    }],
    "quality": "High",
    "usage": "Web3D"
  }]);


  res = await request.get(`/scenes/${name}/cube.glb`);
  await expect(res).toBeOK();
  // It may change without it being a problem. Check the actual file if necessary.
  expect(res.headers()).toHaveProperty("etag", '"yhH03TGHdkBQgKlzJcPpDFD9XdQk9Wq_vBxCzThegYY"');
});


test("uploads and optimize a glb", async ({ page, request }) => {
  test.setTimeout(60000);
  await page.goto("/ui/upload");
  //We are forced to use the rename otherwise we'd have a name collision
  const name = randomUUID();
  await page.locator("input[type=\"file\"]").setInputFiles(path.join(fixtures, "cube.glb"));

  await expect(page.getByRole("listitem").getByText("✓")).toBeVisible();

  const f = page.getByRole("form", { name: "titles.createOrUpdateScene" });
  await expect(f).toBeVisible();
  await expect(f.getByRole("combobox", { name: "labels.setupLocalization" })).toHaveValue("en");
  await f.getByRole("textbox", { name: "labels.sceneName" }).fill(name);
  await page.getByRole("checkbox", { name: "labels.optimizeModel", exact: false }).click();

  await page.getByRole("button", { name: "buttons.uploadScene" }).click();

  const uploads = page.getByRole("region", { name: "titles.createdScenes" });
  await expect(uploads).toBeVisible({ timeout: 50000 });
  //Don't check for actual progress bar visibility because that could be too quick to register
  const link = uploads.getByRole("link", { name: name });
  await link.click();
  await expect(page).toHaveURL(`/ui/scenes/${name}`);
  await expect(page.locator("h1")).toHaveText(name);

  let res = await request.get(`/scenes/${name}/scene.svx.json`);
  await expect(res).toBeOK();
  let doc = JSON.parse((await res.body()).toString());
  expect(doc).toHaveProperty("setups");
  expect(doc.setups).toHaveLength(1);
  expect(doc.setups[0]).toHaveProperty("language", { language: "EN" });


  res = await request.get(`/scenes/${name}/cube.glb`);
  await expect(res).toBeOK();
  const headers = res.headers();
  //We check the etag is different from what we'd have if we didn't request optimization
  expect(headers).toHaveProperty("etag");
  expect(headers).not.toEqual('"4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs"');
});
