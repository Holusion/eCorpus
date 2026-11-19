import path from "node:path";

import { test, expect } from '../fixtures.js';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as user
test.use({ storageState: 'playwright/.auth/user.json', locale: "en" });
test.setTimeout(60000);

test.describe("model upload in Story", function(){
  let name: string;
  test.beforeEach(async ({userPage, createScene})=>{
    name = await createScene();
    await userPage.goto(`/ui/scenes/${encodeURIComponent(name)}/edit`);
    await expect(userPage.locator("sv-node-tree").getByText("Cube", {exact: true})).toBeVisible();
  });

  test("converts and optimizes a dropped model", async ({userPage})=>{
    // See add_model.spec.ts: the dropzone's hidden input stands in for a drop
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.obj"));
    const importMenu = userPage.locator("sv-import-menu");
    await expect(importMenu).toBeVisible();
    await importMenu.getByText("Medium", {exact: true}).click();
    await importMenu.filter({hasText: "Add New Model:"}).getByRole("textbox").fill("Cube2");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible();

    await userPage.locator("sv-node-tree").getByText("Cube2", {exact: true}).click();
    await userPage.getByRole("button", {name: "Derivatives"}).click();
    await expect(userPage.locator("sv-derivatives-task-view")).toContainText("Web3D - Medium");

    // The server chose the name of the derivative it made
    const res = await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-medium.glb`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("model/gltf-binary");
  });

  test("shows the server's error in the menu", async ({userPage})=>{
    await userPage.route("**/uploads/*/derivatives/**", route=>route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({code: 400, message: "Some conversion error"}),
    }));
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.obj"));
    const importMenu = userPage.locator("sv-import-menu");
    await importMenu.getByText("Low", {exact: true}).click();
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).toContainText("Some conversion error");
    //Back to the choices: importing again retries
    await expect(importMenu.getByRole("status")).toHaveCount(0);

    await userPage.unroute("**/uploads/*/derivatives/**");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible();
    const res = await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-low.glb`);
    expect(res.status()).toBe(200);
  });

  test("closing the menu abandons the upload", async ({userPage})=>{
    //The data never arrives
    await userPage.route(/\/uploads\/\d+$/, ()=>{});
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.obj"));
    const importMenu = userPage.locator("sv-import-menu");
    await importMenu.getByText("High", {exact: true}).click();
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu.getByRole("status")).toContainText("Uploading...");

    const removal = userPage.waitForRequest(req=>req.method() === "DELETE" && /\/tasks\/\d+$/.test(req.url()));
    await importMenu.getByTitle("Close").click();
    await expect(importMenu).not.toBeVisible();
    const res = await (await removal).response();
    expect(res?.status()).toBe(204);
  });
});
