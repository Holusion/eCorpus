import path from "node:path";
import { randomUUID } from "node:crypto";

import { test, expect } from '../fixtures.js';
import { readFile } from "node:fs/promises";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/user.json' });

test("uploads and rename a glb", async ({ page, request }) => {
  await page.goto("/ui/upload");
  //We are forced to use the rename otherwise we'd have a name collision
  const name = randomUUID();
  await page.locator("input[type=\"file\"]").setInputFiles(path.join(fixtures, "cube.glb"));

  await expect(page.getByRole("listitem").getByText("✓")).toBeVisible();

  const f = page.getByRole("form", { name: "Create or update a scene" });
  await expect(f).toBeVisible();
  await expect(f.getByRole("combobox", { name: "Default language" })).toHaveValue("en");
  await f.getByRole("textbox", { name: "Scene name" }).fill(name);
  await page.getByRole("button", { name: "create a scene" }).click();

  const uploads = page.getByRole("region", { name: "Created Scenes" });
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
  expect(res.headers()).toHaveProperty("etag", "W/4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs");
});

test("uploads and rename a glb (force FR)", async ({ page, request }) => {
  await page.goto("/ui/upload");
  //We are forced to use the rename otherwise we'd have a name collision
  const name = randomUUID();
  await page.locator("input[type=\"file\"]").setInputFiles(path.join(fixtures, "cube.glb"));

  await expect(page.getByRole("listitem").getByText("✓")).toBeVisible();

  const f = page.getByRole("form", { name: "Create or update a scene" });
  const uploads = page.getByRole("region", { name: "Created Scenes" });

  await expect(f).toBeVisible();
  await expect(uploads).not.toBeVisible();

  await f.getByRole("combobox", { name: "Default language" }).selectOption("fr");
  await f.getByRole("textbox", { name: "Scene name" }).fill(name);

  await page.getByRole("button", { name: "create a scene" }).click();

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
  expect(res.headers()).toHaveProperty("etag", "W/4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs");
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
  await page.getByText("select one or several files").click();
  const fileChooser = await fileChooserPromise;
  fileChooser.setFiles(files);

  //Don't check for actual progress bar visibility because that could be too quick to register
  //Just wait for all files to be done
  for (let file of files) {
    await expect(page.locator(`#upload-${file.name.replace(/[^-_a-z0-9]/g, "_")}.upload-done`)).toBeVisible();
  }

  const f = section.getByRole("form", { name: "Create or update a scene" });
  const btn = section.getByRole("button", { name: "create a scene" });
  await expect(f).toBeVisible();
  await expect(btn).toBeVisible();
  await btn.scrollIntoViewIfNeeded();

  await f.getByRole("textbox", { name: "Scene name" }).fill(name);
  await f.getByRole("combobox", { name: "Default language" }).selectOption("fr");

  //Submit
  await btn.click();

  const uploads = page.getByRole("region", { name: "Created Scenes" });
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
    expect(res.headers()).toHaveProperty("etag", "W/4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs");
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

  const f = page.getByRole("form", { name: "Create or update a scene" });
  await expect(f).toBeVisible();
  await expect(f.getByRole("combobox", { name: "Default language" })).toHaveValue("en");
  await f.getByRole("textbox", { name: "Scene name" }).fill(name);
  await page.getByRole("button", { name: "create a scene" }).click();

  const uploads = page.getByRole("region", { name: "Created Scenes" });
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
  expect(res.headers()).toHaveProperty("etag", "W/yhH03TGHdkBQgKlzJcPpDFD9XdQk9Wq_vBxCzThegYY");
});


test("uploads and optimize a glb", async ({ page, request }) => {
  test.setTimeout(60000);
  await page.goto("/ui/upload");
  //We are forced to use the rename otherwise we'd have a name collision
  const name = randomUUID();
  await page.locator("input[type=\"file\"]").setInputFiles(path.join(fixtures, "cube.glb"));

  await expect(page.getByRole("listitem").getByText("✓")).toBeVisible();

  const f = page.getByRole("form", { name: "Create or update a scene" });
  await expect(f).toBeVisible();
  await expect(f.getByRole("combobox", { name: "Default language" })).toHaveValue("en");
  await f.getByRole("textbox", { name: "Scene name" }).fill(name);
  await page.getByRole("checkbox", { name: "Optimize models", exact: false }).click();

  await page.getByRole("button", { name: "create a scene" }).click();

  const uploads = page.getByRole("region", { name: "Created Scenes" });
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
  expect(headers).not.toEqual("W/4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs");
});