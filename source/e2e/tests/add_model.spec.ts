import path from "node:path";

import { test, expect } from '../fixtures.js';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

const meters_index = "2";

//Authenticated as user
test.use({ storageState: 'playwright/.auth/user.json', locale: "en" });
test.setTimeout(60000);

test("uses expected units", async ({userPage, createScene})=>{
  //Voyager tends to default to "cm" for scene and model units.
  // we don't want that
  // https://github.com/Smithsonian/dpo-voyager/discussions/463
  let name = await createScene();
  await userPage.goto(`/ui/scenes/${encodeURIComponent(name)}/edit`);
  await userPage.getByRole("button", {name: "Pose"}).click();

  let nodeTree = userPage.locator('sv-node-tree');
  let globalUnit = userPage.locator('sv-pose-task-view sv-property-options').filter({ hasText: 'Global Units' }).getByRole('combobox');
  let itemUnit = userPage.locator('sv-pose-task-view sv-property-options').filter({ hasText: 'Item Units' }).getByRole('combobox');

  //Select the cube
  await nodeTree.getByText('Cube', { exact: true }).click();
  await expect(globalUnit).toHaveValue(meters_index);
  await expect(itemUnit).toHaveValue(meters_index);

  // Drag&drop a second cube.glb into the viewport. simple-dropzone's drop
  // handler walks dataTransfer.items via webkitGetAsEntry(), which returns
  // null for synthesized DataTransfer objects — so we drive the hidden
  // <input id="fileInput"> that the same dropzone listens on for change.
  await userPage.locator("sv-explorer-panel #fileInput").setInputFiles(path.join(fixtures, "cube.glb"));
  const importMenu = userPage.locator("sv-import-menu");
  await expect(importMenu).toBeVisible();
  await importMenu.getByText("High", {exact: true}).click();
  await importMenu.filter({hasText: "Add New Model:"}).getByRole("textbox").fill("Cube2");
  await importMenu.getByRole('button', { name: 'Import Model' }).click();

  await expect(importMenu).not.toBeVisible();

  //Ensure we clear the selection
  await nodeTree.getByText('Environment').click();
  await expect(globalUnit).not.toBeVisible();

  //Select the new model and wait for the selection to take effect

  await nodeTree.getByText('Cube2', { exact: true }).click();

  //Check that our units are right
  await expect(globalUnit).toHaveValue(meters_index);
  await expect(itemUnit).toHaveValue(meters_index);
});