import { expect, test } from '../fixtures.js';
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
    await userPage.goto(`/ui/scenes/${encodeURIComponent(name)}/settings`);
    await userPage.getByRole('button', { name: 'buttons.archive' }).click();

    //We are now on the archived scene's page
    await userPage.waitForURL(new RegExp(`/ui/scenes/${name}%23`));

    //Check it is truly archived
    let res = await userPage.request.get(`/ui/scenes/${encodeURIComponent(name)}`);
    expect(res.status()).toEqual(404);

    await userPage.getByRole("link", {name: "nav.settings"}).click();

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
    await adminPage.goto(`/ui/scenes/${encodeURIComponent(name)}/settings`);
    await adminPage.getByRole('button', { name: 'buttons.archive' }).click()
    await adminPage.waitForURL(new RegExp(`/ui/scenes/${name}%23`));

    let res = await adminPage.request.get(`/ui/scenes/${encodeURIComponent(name)}`);
    expect(res.status()).toEqual(404);
  });

});

test("read-only view", async ({page, createScene})=>{
  let name = await createScene({public_access: "read"});
  await page.goto(`/ui/scenes/${encodeURIComponent(name)}`);

  //Expect "edit" and "history" buttons to be present
  await expect(page.getByRole("link", {name: "labels.view", exact: true})).toBeVisible();
  await expect(page.getByRole("link", {name: "labels.edit", exact: true})).not.toBeVisible();
  await expect(page.getByRole("link", {name: "buttons.history", exact: true})).not.toBeVisible();

  let res= await page.goto(`/ui/scenes/${encodeURIComponent(name)}/edit`);
  expect(res?.status()).toEqual(404);
});


test("404 view", async ({page, createScene})=>{
  let name = await createScene({public_access: "none"});
  for (let p of ["", "edit", "view", "history"]) {
    let res= await page.goto(`/ui/scenes/${encodeURIComponent(name)}/${p}`);
    expect(res?.status()).toEqual(404);
  }
});

test.describe("permissions UI", ()=>{
  test("author can switch public_access from none to read via the dropdown", async ({userPage, createScene})=>{
    const name = await createScene({public_access: "none"});
    await userPage.goto(`/ui/scenes/${encodeURIComponent(name)}/settings`);

    const select = userPage.locator('select[name="public_access"]');
    await expect(select).toHaveValue("none");

    const patched = userPage.waitForResponse(resp =>
      resp.url().endsWith(`/scenes/${name}`)
      && resp.request().method() === "PATCH"
      && resp.ok()
    );
    await select.selectOption("read");
    await patched;
    // submit-fragment reloads the page on success.
    await userPage.waitForURL(`/ui/scenes/${encodeURIComponent(name)}/settings`);

    await expect(userPage.locator('select[name="public_access"]')).toHaveValue("read");
  });

  test("author can grant another user write access via the form", async ({userPage, createScene, uniqueAccount})=>{
    const name = await createScene();
    const target = await uniqueAccount("create");

    await userPage.goto(`/ui/scenes/${encodeURIComponent(name)}/settings`);

    // The "add user permission" submit-fragment is the one that contains the
    // free-text username input (the group form has name="groupName" instead).
    const addUserForm = userPage.locator('submit-fragment').filter({
      has: userPage.locator('input[name="username"][required]'),
    });
    await expect(addUserForm).toBeVisible();

    await addUserForm.locator('input[name="username"]').fill(target.username);

    const granted = userPage.waitForResponse(resp =>
      resp.url().endsWith(`/auth/access/${name}`)
      && resp.request().method() === "PATCH"
      && resp.ok()
    );
    await addUserForm.locator('select[name="access"]').selectOption("write");
    await granted;
    await userPage.waitForURL(`/ui/scenes/${encodeURIComponent(name)}/settings`);

    // After reload, the target user shows up in the per-user permissions table
    // with the access we just granted.
    await expect(userPage.getByRole("row").filter({hasText: target.username})).toContainText("fields.write");
  });
});