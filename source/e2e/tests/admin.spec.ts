import path from "node:path";


import { expect, test } from '@playwright/test';
import { randomBytes, randomUUID } from "node:crypto";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/admin.json', locale: "cimode" });



test("can create a new user", async ({page})=>{
  await page.goto("/ui/admin/users");
  let name = `test-createuser-${randomBytes(6).toString("base64url")}`;
  let password = randomUUID();
  let email = `${name}@example.com`;
  await page.getByRole("button", {name: "buttons.createUser"}).click();
  const form = page.getByRole("dialog", {name: "labels.createUser"});
  await expect(form).toBeVisible();
  await form.getByRole("textbox", {name: "labels.username"}).fill(name);
  await form.getByRole("textbox", {name: "password"}).fill(password);
  await form.getByRole("textbox", {name: "email"}).fill(email);
  await form.getByRole("combobox", {name: ""}).selectOption("manage");
  await form.getByRole("button", {name: "buttons.submit"}).click();

  await expect(page.getByRole("table").getByText(name, {exact: true})).toBeVisible();
});

test("can delete a non-admin user", async ({page, request})=>{
  let username = `test-deleteuser-${randomBytes(6).toString("base64url")}`;
  let u = {
    username,
    password: randomUUID(),
    email: `${username}@example.com`,
  };

  let res = await request.post("/users", {
    data: u,
  });
  await expect(res).toBeOK();

  await page.goto("/ui/admin/users");

  let userRow = page.getByRole("row", {name: username});
  await expect(userRow).toBeVisible();
  await userRow.getByRole("button", {name: "labels.delete"}).click();

  await expect(userRow).not.toBeVisible();
});

test("can force-delete archived scenes", async ({page, request})=>{

  const name = randomUUID();
  const fs = await import("node:fs/promises");
  const data = await fs.readFile(path.join(fixtures, "cube.glb"))
  let res = await page.request.post(`/scenes/${encodeURIComponent(name)}`, {
    data,
    headers: {"Content-Type": "model/gltf-binary"}
  });
  await expect(res).toBeOK();

  res = await page.request.delete(`/scenes/${encodeURIComponent(name)}?archive=true`);
  await expect(res).toBeOK();

  res = await request.get(`/scenes?archived=any&match=${name}`);
  let body = await res.json();
  expect(body.scenes).toHaveLength(1);
  expect(new Date(body.scenes[0].archived).toString()).not.toEqual("Invalid Date");

  //There can be any number of archived scenes shown here that leaks from other tests
  //But we expect "our" scene to be there and that's what we are looking for
  await page.goto("/ui/admin/archives");

  await expect(page.getByRole("link", {name})).toBeVisible();

  await page.getByRole("row", {name}).getByRole("button", {name: "labels.delete"}).click();


  await expect(page.getByRole("link", {name})).not.toBeVisible();


  res = await request.get(`/scenes?archived=any&match=${name}`);
  body = await res.json();
  expect(body.scenes).toHaveLength(0);
});

test("can restore archived scenes", async ({page, request})=>{

  const name = randomUUID();
  const fs = await import("node:fs/promises");
  const data = await fs.readFile(path.join(fixtures, "cube.glb"))
  let res = await page.request.post(`/scenes/${encodeURIComponent(name)}`, {
    data,
    headers: {"Content-Type": "model/gltf-binary"}
  });
  await expect(res).toBeOK();

  res = await page.request.delete(`/scenes/${encodeURIComponent(name)}?archive=true`);
  await expect(res).toBeOK();

  res = await request.get(`/scenes?archived=any&match=${name}`);
  let body = await res.json();
  expect(body.scenes).toHaveLength(1);
  expect(new Date(body.scenes[0].archived).toString()).not.toEqual("Invalid Date");

  //There can be any number of archived scenes shown here that leaks from other tests
  //But we expect "our" scene to be there and that's what we are looking for
  await page.goto("/ui/admin/archives");

  await expect(page.getByRole("link", {name})).toBeVisible();

  await page.getByRole("row", {name}).getByRole("button", {name: "labels.restore"}).click();


  await expect(page.getByRole("link", {name})).not.toBeVisible();


  res = await request.get(`/scenes?archived=any&match=${name}`);
  body = await res.json();
  expect(body.scenes).toHaveLength(1);
  expect(body.scenes[0]).toHaveProperty("archived", null);
});