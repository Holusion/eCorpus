import path from "node:path";

import type { Locator } from "@playwright/test";
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

  /** The model, with the files it refers to */
  const objFiles = ["cube.obj", "cube.mtl", "Diffuse.jpg"].map(f=>path.join(fixtures, f));

  /** A quality's entry in the import menu */
  const quality = (importMenu: Locator, name: string)=>importMenu.getByRole("checkbox", {name, exact: true});
  /** The files that go with the model, as listed in the import menu */
  const fileList = (importMenu: Locator)=>importMenu.getByRole("region", {name: "Files"}).getByRole("listitem");
  /** The collapsed choice of the model it goes to */
  const targetToggle = (importMenu: Locator)=>importMenu.getByRole("region", {name: "Target"}).getByRole("button", {expanded: false});

  /** Name the new model, through the target's section */
  async function nameNewModel(importMenu: Locator, name: string){
    await targetToggle(importMenu).click();
    const input = importMenu.getByRole("textbox", {name: "New model"});
    await input.fill(name);
    await input.press("Enter");
    await expect(targetToggle(importMenu)).toHaveText(`New model ${name}`);
  }

  test("converts and optimizes a dropped model", async ({userPage})=>{
    // See add_model.spec.ts: the dropzone's hidden input stands in for a drop
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = userPage.locator("sv-import-menu");
    await expect(importMenu).toBeVisible();
    //The other files go with the model: they're not imported on their own
    await expect(fileList(importMenu)).toHaveText(["cube.obj Model", "Diffuse.jpg", "cube.mtl"]);
    await expect(userPage.locator("sv-img-import-menu")).toHaveCount(0);
    //A new model, collapsed
    await expect(targetToggle(importMenu)).toHaveText("New model Model1");
    //A Thumb and a High quality model by default, optimized
    for(const name of ["Thumb", "High"]) await expect(quality(importMenu, name)).toBeChecked();
    for(const name of ["Low", "Medium", "Highest", "AR"]) await expect(quality(importMenu, name)).not.toBeChecked();
    await expect(importMenu.getByRole("checkbox", {name: "Optimize"})).toBeChecked();
    await nameNewModel(importMenu, "Cube2");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible({timeout: 30000});

    await userPage.locator("sv-node-tree").getByText("Cube2", {exact: true}).click();
    await userPage.getByRole("button", {name: "Derivatives"}).click();
    const derivatives = userPage.locator("sv-derivatives-task-view");
    await expect(derivatives).toContainText("Web3D - Thumb");
    await expect(derivatives).toContainText("Web3D - High");

    // The server chose the names of the derivatives it made
    for(const file of ["cube-thumb.glb", "cube-high.glb"]){
      const res = await userPage.request.get(`/scenes/${encodeURIComponent(name)}/${file}`);
      expect(res.status(), file).toBe(200);
      expect(res.headers()["content-type"]).toBe("model/gltf-binary");
    }
    // The files it refers to were used to make it, they're not in the scene
    for(const file of ["cube.obj", "cube.mtl", "Diffuse.jpg", "articles/Diffuse.jpg"]){
      expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/${file}`)).status(), file).toBe(404);
    }
  });

  test("makes the qualities that are chosen", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = userPage.locator("sv-import-menu");
    await quality(importMenu, "Thumb").click();
    await quality(importMenu, "High").click();
    await quality(importMenu, "Medium").click();
    for(const name of ["Thumb", "High"]) await expect(quality(importMenu, name)).not.toBeChecked();
    await expect(quality(importMenu, "Medium")).toBeChecked();
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible();
    expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-medium.glb`)).status()).toBe(200);
    for(const file of ["cube-thumb.glb", "cube-high.glb"]){
      expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/${file}`)).status(), file).toBe(404);
    }
  });

  test("asks for a quality", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = userPage.locator("sv-import-menu");
    await quality(importMenu, "Thumb").click();
    await quality(importMenu, "High").click();
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).toContainText("Please select derivative quality.");
    await expect(importMenu.getByRole("status")).toHaveCount(0);
  });

  test("uses the highest quality as it is sent, if it's not to be optimized", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.glb"));
    const importMenu = userPage.locator("sv-import-menu");
    await importMenu.getByRole("checkbox", {name: "Optimize"}).uncheck();
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible();
    const high = await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-high.glb`);
    expect(high.headers()).toHaveProperty("etag", '"4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs"');
    //Lower qualities still are
    const thumb = await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-thumb.glb`);
    expect(thumb.status()).toBe(200);
    expect(thumb.headers()["etag"]).not.toEqual('"4diz3Hx67bxWyU9b_iCJD864pVJ6OGYCPh9sU40QyLs"');
  });

  test("adds to an existing model, replacing the qualities it has", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = userPage.locator("sv-import-menu");
    await targetToggle(importMenu).click();
    await importMenu.getByRole("radio", {name: "Add to existing model"}).click();
    await importMenu.getByText("Cube", {exact: true}).click();
    //Collapsed again, on the model
    await expect(targetToggle(importMenu)).toHaveText("Add to Cube");
    await expect(quality(importMenu, "High")).toHaveAccessibleDescription("Already in the model: it will be replaced");
    await expect(quality(importMenu, "Thumb")).toHaveAccessibleDescription("");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible({timeout: 30000});

    //No new model
    await expect(userPage.locator("sv-node-tree").getByText("Model1", {exact: true})).toHaveCount(0);
    await userPage.locator("sv-node-tree").getByText("Cube", {exact: true}).click();
    await userPage.getByRole("button", {name: "Derivatives"}).click();
    const derivatives = userPage.locator("sv-derivatives-task-view");
    await expect(derivatives).toContainText("Web3D - Thumb");
    await expect(derivatives).toContainText("Web3D - High");
  });

  test("files can be removed from the model's", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = userPage.locator("sv-import-menu");
    await importMenu.getByTitle("Remove cube.mtl").click();
    await expect(fileList(importMenu)).toHaveText(["cube.obj Model", "Diffuse.jpg"]);
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    //The message names cube.mtl, but the server answers in cimode here
    await expect(importMenu).toContainText("errors.upload.convertFailed");
  });

  test("files can be added to the model's with a file picker", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.obj"));
    const importMenu = userPage.locator("sv-import-menu");
    await expect(fileList(importMenu)).toHaveText(["cube.obj Model"]);
    const chooser = userPage.waitForEvent("filechooser");
    await importMenu.getByRole("button", {name: "Add files"}).click();
    await (await chooser).setFiles(objFiles.slice(1));
    await expect(fileList(importMenu)).toHaveText(["cube.obj Model", "Diffuse.jpg", "cube.mtl"]);
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible({timeout: 30000});
    expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-high.glb`)).status()).toBe(200);
  });

  test("files dropped while the menu is open go with the model", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.obj"));
    const importMenu = userPage.locator("sv-import-menu");
    await expect(fileList(importMenu)).toHaveText(["cube.obj Model"]);
    //Dropped on the scene, outside of the menu
    const dataTransfer = await userPage.evaluateHandle(()=>{
      const dt = new DataTransfer();
      dt.items.add(new File(["newmtl Material\n"], "cube.mtl", {type: "text/plain"}));
      return dt;
    });
    const viewport = userPage.locator("sv-explorer-panel");
    await viewport.dispatchEvent("dragover", {dataTransfer});
    await viewport.dispatchEvent("drop", {dataTransfer});
    await expect(fileList(importMenu)).toHaveText(["cube.obj Model", "cube.mtl"]);
    //Not imported on its own
    await expect(userPage.locator("sv-import-menu")).toHaveCount(1);
  });

  test("tells which file a model is missing", async ({userPage})=>{
    //No .mtl
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.obj"));
    const importMenu = userPage.locator("sv-import-menu");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    //The message names cube.mtl, but the server answers in cimode here
    await expect(importMenu).toContainText("errors.upload.convertFailed");
  });

  test("shows the server's error in the menu", async ({userPage})=>{
    await userPage.route("**/uploads/*/derivatives", route=>route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({code: 400, message: "Some conversion error"}),
    }));
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = userPage.locator("sv-import-menu");
    //Only Low
    await quality(importMenu, "Thumb").click();
    await quality(importMenu, "High").click();
    await quality(importMenu, "Low").click();
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).toContainText("Some conversion error");
    //Back to the choices: importing again retries
    await expect(importMenu.getByRole("status")).toHaveCount(0);

    await userPage.unroute("**/uploads/*/derivatives");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible();
    const res = await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-low.glb`);
    expect(res.status()).toBe(200);
  });

  test("closing the menu abandons the upload", async ({userPage})=>{
    //The data never arrives
    await userPage.route(/\/uploads\/\d+\/files\//, ()=>{});
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = userPage.locator("sv-import-menu");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu.getByRole("status")).toContainText("Uploading...");

    const removal = userPage.waitForRequest(req=>req.method() === "DELETE" && /\/tasks\/\d+$/.test(req.url()));
    await importMenu.getByTitle("Close").click();
    await expect(importMenu).not.toBeVisible();
    const res = await (await removal).response();
    expect(res?.status()).toBe(204);
  });
});
