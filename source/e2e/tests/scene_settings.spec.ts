import path from "node:path";
import fs from "node:fs/promises";


import { expect, test } from '../fixtures';
import { randomUUID } from "node:crypto";



test.use({ storageState: {cookies:[], origins: []}, locale: "cimode"});


//Authenticated as user


test.describe("author", ()=>{

  test("can edit his scenes", async ({userPage, createScene})=>{
    let name = await createScene();
    await userPage.goto(`/ui/scenes/${encodeURIComponent(name)}`);
  
    //Expect "edit" and "history" buttons to be present
    await expect(userPage.getByRole("link", {name: "labels.edit", exact: true})).toHaveAttribute("href", `/ui/scenes/${encodeURIComponent(name)}/edit`)
    await expect(userPage.getByRole("link", {name: "buttons.history", exact: true})).toHaveAttribute("href", `/ui/scenes/${encodeURIComponent(name)}/history`)
  });

  test("can archive and restore his scenes", async ({userPage, createScene})=>{
    let name = await createScene();
    await userPage.goto(`/ui/scenes/${encodeURIComponent(name)}`);
    await userPage.getByRole('button', { name: 'buttons.archive' }).click();

    //We are now on the archived scene's page
    await userPage.waitForURL(/\/ui\/scenes\/.+/);

    //Check it is truly archived
    let res = await userPage.request.get(`/ui/scenes/${encodeURIComponent(name)}`);
    expect(res.status()).toEqual(404);

    //Default rename target should be our original name
    await expect(userPage.locator("#scene-name-input")).toHaveValue(name);
    //Decide of a new name for the scene
    let newName = randomUUID();
    await userPage.locator("#scene-name-input").fill(newName);
    await userPage.getByRole("button", {name: "labels.restore"}).click();

    await userPage.waitForURL(`/ui/scenes/${newName}`);
  });
});

test.describe("admin", ()=>{
  test("can edit other users' scenes", async ({adminPage, createScene})=>{
    let name = await createScene();
    await adminPage.goto(`/ui/scenes/${encodeURIComponent(name)}`);
  
    //Expect "edit" and "history" buttons to be present
    await expect(adminPage.getByRole("link", {name: "labels.edit", exact: true})).toHaveAttribute("href", `/ui/scenes/${encodeURIComponent(name)}/edit`)
    await expect(adminPage.getByRole("link", {name: "buttons.history", exact: true})).toHaveAttribute("href", `/ui/scenes/${encodeURIComponent(name)}/history`)
  });

  test("can archive other user's scene", async ({adminPage, createScene})=>{
    let name = await createScene();
    await adminPage.goto(`/ui/scenes/${encodeURIComponent(name)}`);
    await adminPage.getByRole('button', { name: 'buttons.archive' }).click()
    await adminPage.waitForURL(new RegExp(`/ui/scenes/${name}`));

    let res = await adminPage.request.get(`/ui/scenes/${encodeURIComponent(name)}`);
    expect(res.status()).toEqual(404);
  });

});

test("read-only view", async ({page, createScene})=>{
  let name = await createScene();
  await page.goto(`/ui/scenes/${encodeURIComponent(name)}`);

  //Expect "edit" and "history" buttons to be present
  await expect(page.getByRole("link", {name: "labels.view", exact: true})).toBeVisible();
  await expect(page.getByRole("link", {name: "labels.edit", exact: true})).not.toBeVisible();
  await expect(page.getByRole("link", {name: "buttons.history", exact: true})).not.toBeVisible();

  let res= await page.goto(`/ui/scenes/${encodeURIComponent(name)}/edit`);
  expect(res?.status()).toEqual(404);
});


test("404 view", async ({page, createScene})=>{
  let name = await createScene({permissions: {default: "none"}});
  for (let p of ["", "edit", "view", "history"]) {
    let res= await page.goto(`/ui/scenes/${encodeURIComponent(name)}/${p}`);
    expect(res?.status()).toEqual(404);
  }
});