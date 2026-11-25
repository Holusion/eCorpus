import path from "node:path";
import { randomUUID } from "node:crypto";

import { test, expect } from '../fixtures.js';
import type { Page } from "@playwright/test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/user.json', cimode: true });

test("shows a model report with localized warnings and recommendations", async ({ page }) => {
  await page.goto("/ui/upload");
  await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "cube_textured.glb"));
  const report = page.getByRole("status");
  await expect(report.getByRole("listitem")).toHaveText(["modelWarnings.png-images"]);
  await expect(report.getByText("modelWarnings.recommend-optimize", { exact: true })).toBeVisible();
  await page.getByTitle("remove upload").click();
  await expect(report).toHaveCount(0);
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
    // Contexts inherit the "cimode" headers from test.use()
    const context = await browser.newContext({ locale, baseURL, extraHTTPHeaders: {}, storageState: 'playwright/.auth/user.json' });
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
  //Kept as it was sent
  await f.getByRole("checkbox", { name: "labels.optimizeModel", exact: false }).uncheck();
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
  //A Thumb is made along with the High quality model
  expect(doc.models).toHaveLength(1);
  expect(doc.models[0].derivatives.map((d: any) => [d.quality, d.assets[0].uri])).toEqual([
    ["High", "cube.glb"],
    ["Thumb", "cube-thumb.glb"],
  ]);
  await expect(await request.get(`/scenes/${name}/cube-thumb.glb`)).toBeOK();


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
  //What was started before, and hasn't been read, may be there
  await expect(uploads.getByRole("link", { name: name })).toHaveCount(0);

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
  }

});

/** Upload an obj with the files it refers to: one upload line, with "+2" files */
async function uploadObjSet(page: Page) {
  await page.goto("/ui/upload");
  await page.locator("input[type=\"file\"]").setInputFiles([
    path.join(fixtures, "cube.obj"),
    path.join(fixtures, "cube.mtl"),
    path.join(fixtures, "Diffuse.jpg"),
  ]);
  const line = page.locator(".upload-line").filter({ hasText: "cube.obj" });
  const toggle = line.getByRole("button", { name: "+2" });
  //The files that come with it are known once the server has inspected the OBJ and the MTL
  await expect(toggle).toBeVisible();
  return {
    name: line.getByText("cube.obj", { exact: true }),
    toggle,
    list: line.getByRole("list"),
  };
}

test("lists the files that come with a model while its name is hovered", async ({ page }) => {
  const { name, toggle, list } = await uploadObjSet(page);
  await expect(list).toBeHidden();

  await name.hover();
  await expect(list).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveText(["cube.mtl", "Diffuse.jpg"]);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  //The pointer can go over the list
  await list.getByRole("listitem").last().hover();
  await expect(list).toBeVisible();
  //Clicking keeps it open
  await name.click();
  await expect(list).toBeVisible();
  await list.getByRole("listitem").first().click();
  await expect(list).toBeVisible();

  await page.getByRole("heading", { level: 1 }).hover();
  await expect(list).toBeHidden();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  //From the keyboard
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
});

test.describe("on touch screens", () => {
  test.use({ hasTouch: true });

  test("lists the files that come with a model when its name is tapped", async ({ page }) => {
    const { name, list } = await uploadObjSet(page);
    await name.tap();
    await expect(list).toBeVisible();
    await name.tap();
    await expect(list).toBeHidden();
    await name.tap();
    await expect(list).toBeVisible();
    //Tapping elsewhere closes it
    await page.getByRole("heading", { level: 1 }).tap();
    await expect(list).toBeHidden();
  });
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

  //One upload: the model, with the files it refers to
  await expect(page.getByRole("listitem").getByText("✓")).toHaveCount(1);
  await expect(page.locator(".upload-line").filter({ hasText: "cube.obj" })).toContainText("+2");

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
  //A Thumb is made along with the High quality model
  expect(doc.models[0].derivatives).toEqual(["High", "Thumb"].map(quality => ({
    "assets": [{
      "byteSize": expect.any(Number),
      //The texture was found
      "imageSize": 96,
      "numFaces": 12,
      "type": "Model",
      "uri": quality === "High" ? "cube.glb" : "cube-thumb.glb",
    }],
    "quality": quality,
    "usage": "Web3D"
  })));
  await expect(await request.get(`/scenes/${name}/cube-thumb.glb`)).toBeOK();

  res = await request.get(`/scenes/${name}/cube.glb`);
  await expect(res).toBeOK();
  //The files it refers to were used to make it, they're not in the scene
  for (const file of ["cube.obj", "cube.mtl", "Diffuse.jpg"]) {
    expect((await request.get(`/scenes/${name}/${file}`)).status(), file).toBe(404);
  }
});


test("sends files a model doesn't refer to on their own", async ({ page }) => {
  await page.goto("/ui/upload");
  //Playwright can't mix file paths and buffers
  const files = await Promise.all(["cube.obj", "cube.mtl", "Diffuse.jpg"].map(async (name) => ({
    name, mimeType: "application/octet-stream", buffer: await readFile(path.join(fixtures, name)),
  })));
  await page.locator("input[type=\"file\"]").setInputFiles([
    ...files,
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Scanned on a sunny day") },
  ]);
  const model = page.locator(".upload-line").filter({ hasText: "cube.obj" });
  const notes = page.locator(".upload-line").filter({ hasText: "notes.txt" });
  await expect(page.getByRole("listitem").getByText("✓")).toHaveCount(2);
  await expect(model.getByRole("button", { name: "+2" })).toBeVisible();
  //No "+N": it comes alone
  await expect(notes.getByRole("button")).toHaveCount(0);
  await expect(model.getByRole("status")).toHaveCount(0);
});

test("sends what a glTF refers to along with it", async ({ page }) => {
  //A glTF with its .bin and texture beside it
  const dir = await mkdtemp(path.join(tmpdir(), "gltf-"));
  try {
    await promisify(execFile)("meshtinker", ["import", path.join(fixtures, "cube_textured.glb"), path.join(dir, "cube.gltf")]);
    const files = await Promise.all((await readdir(dir)).map(async (name) => ({
      name, mimeType: "application/octet-stream", buffer: await readFile(path.join(dir, name)),
    })));
    expect(files.length).toBeGreaterThan(2);
    await page.goto("/ui/upload");
    await page.locator("input[type=\"file\"]").setInputFiles([
      ...files,
      { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Scanned on a sunny day") },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  const model = page.locator(".upload-line").filter({ hasText: "cube.gltf" });
  await expect(page.getByRole("listitem").getByText("✓")).toHaveCount(2);
  await expect(model.getByRole("button", { name: "+2" })).toBeVisible();
  await expect(page.locator(".upload-line").filter({ hasText: "notes.txt" }).getByText("✓")).toBeVisible();
  await expect(model.getByRole("status")).toHaveCount(0);
});

test("warns about a file a model refers to that wasn't given", async ({ page }) => {
  await page.goto("/ui/upload");
  await page.locator("input[type=\"file\"]").setInputFiles([
    path.join(fixtures, "cube.obj"),
    path.join(fixtures, "Diffuse.jpg"),
  ]);
  const model = page.locator(".upload-line").filter({ hasText: "cube.obj" });
  //Only the MTL refers to the texture
  await expect(page.locator(".upload-line").filter({ hasText: "Diffuse.jpg" }).getByText("✓")).toBeVisible();
  await expect(model.getByText("✓")).toBeVisible();
  await expect(model.getByRole("status").getByRole("listitem")).toHaveText(["info.missingUploadFile"]);
  await expect(model.getByRole("button", { name: /^\+/ })).toHaveCount(0);
});

test("warns about the files a glTF refers to that weren't given", async ({ page }) => {
  const dir = await mkdtemp(path.join(tmpdir(), "gltf-"));
  let gltf: Buffer;
  try {
    await promisify(execFile)("meshtinker", ["import", path.join(fixtures, "cube_textured.glb"), path.join(dir, "cube.gltf")]);
    gltf = await readFile(path.join(dir, "cube.gltf"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await page.goto("/ui/upload");
  await page.locator("input[type=\"file\"]").setInputFiles({ name: "cube.gltf", mimeType: "model/gltf+json", buffer: gltf });
  const model = page.locator(".upload-line").filter({ hasText: "cube.gltf" });
  await expect(model.getByText("✓")).toBeVisible();
  //Its .bin and its texture
  await expect(model.getByRole("status").getByRole("listitem")).toHaveText(["info.missingUploadFile", "info.missingUploadFile"]);
});

test("a file given later meets what an earlier upload misses", async ({ page }) => {
  await page.goto("/ui/upload");
  const input = page.locator("input[type=\"file\"]");
  const model = page.locator(".upload-line").filter({ hasText: "cube.obj" });
  const mtl = page.locator(".upload-line").filter({ hasText: "cube.mtl" });
  const texture = page.locator(".upload-line").filter({ hasText: "Diffuse.jpg" });

  await input.setInputFiles(path.join(fixtures, "cube.obj"));
  await expect(model.getByText("✓")).toBeVisible();
  await expect(model.getByRole("status").getByRole("listitem")).toHaveText(["info.missingUploadFile"]);

  //Uploads are side by side in the scene: the model finds it
  await input.setInputFiles(path.join(fixtures, "cube.mtl"));
  await expect(mtl.getByText("✓")).toBeVisible();
  await expect(model.getByRole("status")).toHaveCount(0);
  await expect(mtl.getByRole("status").getByRole("listitem")).toHaveText(["info.missingUploadFile"]);

  await input.setInputFiles(path.join(fixtures, "Diffuse.jpg"));
  await expect(texture.getByText("✓")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);

  //It's missing again once removed
  await texture.getByTitle("remove upload").click();
  await expect(texture).toHaveCount(0);
  await expect(mtl.getByRole("status").getByRole("listitem")).toHaveText(["info.missingUploadFile"]);
});

test("tells a model can't be converted as soon as it's sent", async ({ page }) => {
  await page.goto("/ui/upload");
  await page.locator("input[type=\"file\"]").setInputFiles([
    { name: "remote.obj", mimeType: "model/obj", buffer: Buffer.from("mtllib http://example.com/remote.mtl\nv 0 0 0\n") },
  ]);
  const model = page.locator(".upload-line").filter({ hasText: "remote.obj" });
  await expect(model.getByText("⚠")).toBeVisible();
  await expect(model).toContainText("errors.upload.convertFailed");
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
  //Optimized by default
  await expect(page.getByRole("checkbox", { name: "labels.optimizeModel", exact: false })).toBeChecked();

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
  //A Thumb is made along with the High quality model
  expect(doc.models).toHaveLength(1);
  expect(doc.models[0].derivatives.map((d: any) => [d.quality, d.assets[0].uri])).toEqual([
    ["High", "cube.glb"],
    ["Thumb", "cube-thumb.glb"],
  ]);
  await expect(await request.get(`/scenes/${name}/cube-thumb.glb`)).toBeOK();


  res = await request.get(`/scenes/${name}/cube.glb`);
  await expect(res).toBeOK();
  const headers = res.headers();
  //We check the etag is different from what we'd have if we didn't request optimization
  expect(headers).toHaveProperty("etag");
  expect(headers.etag).not.toEqual('"4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs"');
});
