import path from "node:path";


import { expect, test } from '@playwright/test';
import { randomUUID } from "node:crypto";

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/admin.json', locale: "cimode" });



test.skip("can create a new user", async ({page})=>{
  await page.goto("/ui/admin/users");

});

test.skip("can delete a non-admin user", async ({page})=>{

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
  expect(body.scenes[0]).toHaveProperty("archived", true);

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
  expect(body.scenes[0]).toHaveProperty("archived", true);

  //There can be any number of archived scenes shown here that leaks from other tests
  //But we expect "our" scene to be there and that's what we are looking for
  await page.goto("/ui/admin/archives");

  await expect(page.getByRole("link", {name})).toBeVisible();

  await page.getByRole("row", {name}).getByRole("button", {name: "labels.restore"}).click();


  await expect(page.getByRole("link", {name})).not.toBeVisible();


  res = await request.get(`/scenes?archived=any&match=${name}`);
  body = await res.json();
  expect(body.scenes).toHaveLength(1);
  expect(body.scenes[0]).toHaveProperty("archived", false);
});