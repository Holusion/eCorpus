import path from "node:path";
import fs from "node:fs/promises";

import type { Locator, Page } from "@playwright/test";
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

  /** eCorpus's import menu, that Voyager Story opens for a dropped model */
  const importMenuOf = (page: Page)=>page.getByRole("dialog", {name: "Import File"});
  /** A quality's entry in the import menu */
  const quality = (importMenu: Locator, name: string)=>importMenu.getByRole("checkbox", {name, exact: true});
  /** The files that go with the model, as listed in the import menu */
  const fileList = (importMenu: Locator)=>importMenu.getByRole("region", {name: "Files"}).getByRole("listitem");
  /** The new model's name, in the "New model" mode */
  const nameInput = (importMenu: Locator)=>importMenu.getByRole("textbox", {name: "Name"});
  /** One of the choices of what to do with the files */
  const choice = (importMenu: Locator, name: string)=>importMenu.getByRole("region", {name: "What to do with it?"}).getByRole("button", {name, exact: true});
  /** One of a model's two uses, as tabs */
  const tab = (importMenu: Locator, name: "New model"|"Add to existing model")=>importMenu.getByRole("tab", {name, exact: true});
  /** Choose to make a new model of the files, once they're checked */
  const newModel = (importMenu: Locator)=>tab(importMenu, "New model").click();

  /** Name the new model */
  async function nameNewModel(importMenu: Locator, name: string){
    await nameInput(importMenu).fill(name);
    await nameInput(importMenu).press("Enter");
  }

  test("converts and optimizes a dropped model", async ({userPage})=>{
    // See add_model.spec.ts: the dropzone's hidden input stands in for a drop
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = importMenuOf(userPage);
    await expect(importMenu).toBeVisible();
    //The other files go with the model: they're not imported on their own
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj\s*Model/, /^\s*Diffuse\.jpg/, /^\s*cube\.mtl/]);
    await expect(userPage.locator("sv-img-import-menu")).toHaveCount(0);
    //Sent while the menu is open
    await expect(fileList(importMenu)).toHaveText([/Sent/, /Sent/, /Sent/]);
    //Each one is referenced: by the model, or by its .mtl
    await expect(importMenu).not.toContainText("Unused?");
    //A new model by default
    await expect(tab(importMenu, "New model")).toHaveAttribute("aria-selected", "true");
    await expect(tab(importMenu, "Add to existing model")).toHaveAttribute("aria-selected", "false");
    await expect(importMenu.getByRole("button", {name: "Import Model"})).toBeEnabled();
    //Named after the file
    await expect(nameInput(importMenu)).toHaveValue("cube");
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
    const importMenu = importMenuOf(userPage);
    await newModel(importMenu);
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
    const importMenu = importMenuOf(userPage);
    await newModel(importMenu);
    await quality(importMenu, "Thumb").click();
    await quality(importMenu, "High").click();
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).toContainText("Please select derivative quality.");
    await expect(importMenu.getByRole("status")).toHaveCount(0);
  });

  test("uses the highest quality as it is sent, if it's not to be optimized", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.glb"));
    const importMenu = importMenuOf(userPage);
    await newModel(importMenu);
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
    const importMenu = importMenuOf(userPage);
    await tab(importMenu, "Add to existing model").click();
    await expect(tab(importMenu, "Add to existing model")).toHaveAttribute("aria-selected", "true");
    //A model is to be chosen
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).toContainText("Please select a model.");
    await expect(importMenu.getByRole("status")).toHaveCount(0);
    await importMenu.getByRole("option", {name: "Cube", exact: true}).click();
    //Collapsed on the model
    await expect(importMenu.getByRole("option")).toHaveCount(0);
    const chosen = importMenu.getByRole("button", {name: "Cube", expanded: false});
    await expect(chosen).toBeVisible();
    await chosen.click();
    await expect(importMenu.getByRole("option", {name: "Cube", exact: true})).toHaveAttribute("aria-selected", "true");
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

  test("the new model's name is the file's, until it's changed", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = importMenuOf(userPage);
    await newModel(importMenu);
    await expect(nameInput(importMenu)).toHaveValue("cube");
    await nameNewModel(importMenu, "My cube");
    //Kept through the other choice
    await tab(importMenu, "Add to existing model").click();
    await expect(nameInput(importMenu)).toHaveCount(0);
    await tab(importMenu, "New model").click();
    await expect(nameInput(importMenu)).toHaveValue("My cube");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible({timeout: 30000});
    await expect(userPage.locator("sv-node-tree").getByText("My cube", {exact: true})).toBeVisible();
  });

  test("files can be removed from the model's", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = importMenuOf(userPage);
    await expect(fileList(importMenu)).toHaveText([/Sent/, /Sent/, /Sent/]);
    await importMenu.getByTitle("Remove cube.mtl").click();
    //It's missing now, and so is what refers to Diffuse.jpg
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj\s*Model/, /^\s*Diffuse\.jpg\s*Unused\?/, /^\s*cube\.mtl\s*Missing/]);
    //The model's options are there, but it can't be imported until the files are right
    await expect(nameInput(importMenu)).toHaveValue("cube");
    await expect(importMenu.getByRole("button", {name: "Import Model"})).toBeDisabled();
    await expect(importMenu.getByRole("button", {name: "Import Model"})).toHaveAccessibleDescription("The model refers to these files: add them to import it.");
  });

  test("files can be added to the model's with a file picker", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.obj"));
    const importMenu = importMenuOf(userPage);
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj\s*Model/, /^\s*cube\.mtl\s*Missing/]);
    const chooser = userPage.waitForEvent("filechooser");
    await importMenu.getByRole("button", {name: "Add files"}).click();
    await (await chooser).setFiles(objFiles.slice(1));
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj\s*Model/, /^\s*Diffuse\.jpg\s*Sent/, /^\s*cube\.mtl\s*Sent/]);
    await newModel(importMenu);
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible({timeout: 30000});
    expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-high.glb`)).status()).toBe(200);
  });

  test("files dropped while the menu is open go with the model", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.obj"));
    const importMenu = importMenuOf(userPage);
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj\s*Model/, /^\s*cube\.mtl\s*Missing/]);
    //Dropped on the scene, outside of the menu
    const dataTransfer = await userPage.evaluateHandle(()=>{
      const dt = new DataTransfer();
      dt.items.add(new File(["newmtl Material\n"], "cube.mtl", {type: "text/plain"}));
      return dt;
    });
    const viewport = userPage.locator("sv-explorer-panel");
    await viewport.dispatchEvent("dragover", {dataTransfer});
    await viewport.dispatchEvent("drop", {dataTransfer});
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj\s*Model/, /^\s*cube\.mtl\s*Sent/]);
    //Not imported on its own
    await expect(importMenuOf(userPage)).toHaveCount(1);
  });

  test("tells which files a model is missing, before it's imported", async ({userPage})=>{
    //A material that refers to a texture in a folder
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles([
      {name: "cube.obj", mimeType: "text/plain", buffer: await fs.readFile(path.join(fixtures, "cube.obj"))},
      {name: "cube.mtl", mimeType: "text/plain", buffer: Buffer.from("newmtl Material\nmap_Kd tex/Diffuse.jpg\n")},
    ]);
    const importMenu = importMenuOf(userPage);
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj\s*Model/, /^\s*cube\.mtl/, /^\s*tex\/Diffuse\.jpg\s*Missing/]);
    await expect(importMenu.getByRole("button", {name: "Import Model"})).toBeDisabled();
    //Clicking the indicator tells what it means
    await importMenu.getByRole("button", {name: "Missing"}).click();
    await expect(importMenu.getByRole("note")).toHaveText("The model refers to these files: add them to import it.");
    await importMenu.getByRole("button", {name: "Missing"}).click();
    await expect(importMenu.getByRole("note")).toHaveCount(0);
    //A picked file has no folder: it's found at the second place
    const chooser = userPage.waitForEvent("filechooser");
    await importMenu.getByRole("button", {name: "Add files"}).click();
    await (await chooser).setFiles(path.join(fixtures, "Diffuse.jpg"));
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj\s*Model/, /^\s*Diffuse\.jpg\s*Sent/, /^\s*cube\.mtl/]);
    await newModel(importMenu);
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible({timeout: 30000});
    expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-high.glb`)).status()).toBe(200);
  });

  test("flags files the model doesn't seem to refer to, and sends them anyway", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles([
      ...await Promise.all(objFiles.map(async f=>({name: path.basename(f), mimeType: "application/octet-stream", buffer: await fs.readFile(f)}))),
      {name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Scanned in 2024\n")},
    ]);
    const importMenu = importMenuOf(userPage);
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.obj/, /^\s*Diffuse\.jpg\s*Sent/, /^\s*cube\.mtl\s*Sent/, /^\s*notes\.txt\s*Unused\?\s*Sent/]);
    await importMenu.getByRole("button", {name: "Unused?"}).click();
    await expect(importMenu.getByRole("note")).toHaveText("The model doesn't seem to refer to it. It's sent anyway: remove it if it's not needed.");
    //Clicking elsewhere hides it
    await importMenu.getByRole("heading", {name: "Import File"}).click();
    await expect(importMenu.getByRole("note")).toHaveCount(0);
    //It may be needed after all: it's not in the way
    await newModel(importMenu);
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible({timeout: 30000});
  });

  test("imports one model at a time, and tells of the others", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles([...objFiles, path.join(fixtures, "cube.glb")]);
    //A single menu, for the first of them
    const importMenu = importMenuOf(userPage);
    await expect(importMenu).toHaveCount(1);
    await expect(fileList(importMenu)).toHaveText([/^\s*cube\.glb\s*Model/, /^\s*Diffuse\.jpg\s*Unused\?/, /^\s*cube\.mtl\s*Unused\?/, /^\s*cube\.obj\s*Another model/]);
    await importMenu.getByRole("button", {name: "Another model"}).click();
    await expect(importMenu.getByRole("note")).toContainText("Only one model is imported at a time");
    await newModel(importMenu);
    await nameNewModel(importMenu, "Cube2");
    await importMenu.getByRole("button", {name: "Import Model"}).click();
    await expect(importMenu).not.toBeVisible({timeout: 30000});
    await expect(userPage.locator("sv-node-tree").getByText("Cube2", {exact: true})).toBeVisible();
    //Made from the glb
    expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/cube-thumb.glb`)).status()).toBe(200);
  });

  test("shows the server's error in the menu", async ({userPage})=>{
    await userPage.route("**/uploads/*/derivatives", route=>route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({code: 400, message: "Some conversion error"}),
    }));
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = importMenuOf(userPage);
    await newModel(importMenu);
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

  test("is opened from the Navigator, for any file", async ({userPage})=>{
    await userPage.locator("sv-navigator-panel").getByRole("button", {name: "Import"}).click();
    const importMenu = importMenuOf(userPage);
    await expect(importMenu).toContainText("Drop files anywhere in the page, or add them.");
    const chooser = userPage.waitForEvent("filechooser");
    await importMenu.getByRole("button", {name: "Add files"}).click();
    await (await chooser).setFiles({name: "notes.html", mimeType: "text/html", buffer: Buffer.from("<p>Scanned in 2024</p>")});
    await expect(fileList(importMenu)).toHaveText([/^\s*notes\.html/]);
    await expect(importMenu).toContainText("They'll be added to the scene's files as they are");
    await importMenu.getByRole("button", {name: "Import", exact: true}).click();
    await expect(importMenu).not.toBeVisible();
    expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/notes.html`)).status()).toBe(200);
  });

  test("makes an image an environment map, an overlay, an image plane or a scene file", async ({userPage})=>{
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "Diffuse.jpg"));
    const importMenu = importMenuOf(userPage);
    //Not Voyager's own menu
    await expect(userPage.locator("sv-img-import-menu")).toHaveCount(0);
    await expect(fileList(importMenu)).toHaveText([/^\s*Diffuse\.jpg\s*Image/]);
    for(const name of ["Environment map", "Overlay map", "Image plane", "Scene file"]){
      await expect(choice(importMenu, name)).toHaveAttribute("aria-pressed", "false");
    }
    await choice(importMenu, "Overlay map").click();
    await importMenu.getByRole("button", {name: "Import", exact: true}).click();
    await expect(importMenu).toContainText("Please select a model.");
    await choice(importMenu, "Environment map").click();
    await importMenu.getByRole("button", {name: "Import", exact: true}).click();
    await expect(importMenu).not.toBeVisible();
    expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/articles/Diffuse.jpg`)).status()).toBe(200);
  });

  test("never replaces a file of the scene", async ({userPage})=>{
    for(const uri of ["articles/Diffuse.jpg", "articles/Diffuse-1.jpg"]){
      await userPage.locator("sv-navigator-panel").getByRole("button", {name: "Import"}).click();
      const importMenu = importMenuOf(userPage);
      const chooser = userPage.waitForEvent("filechooser");
      await importMenu.getByRole("button", {name: "Add files"}).click();
      await (await chooser).setFiles(path.join(fixtures, "Diffuse.jpg"));
      await choice(importMenu, "Scene file").click();
      await importMenu.getByRole("button", {name: "Import", exact: true}).click();
      await expect(importMenu).not.toBeVisible();
      expect((await userPage.request.get(`/scenes/${encodeURIComponent(name)}/${uri}`)).status(), uri).toBe(200);
    }
  });

  test("closing the menu abandons the upload", async ({userPage})=>{
    //The data never arrives
    await userPage.route(/\/uploads\/\d+\/files\//, ()=>{});
    await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(objFiles);
    const importMenu = importMenuOf(userPage);
    await expect(fileList(importMenu).first()).toContainText("Sending 0%");
    await expect(importMenu).toContainText("Checking the files...");

    const removal = userPage.waitForRequest(req=>req.method() === "DELETE" && /\/tasks\/\d+$/.test(req.url()));
    await importMenu.getByTitle("Close").click();
    await expect(importMenu).not.toBeVisible();
    const res = await (await removal).response();
    expect(res?.status()).toBe(204);
  });
});
