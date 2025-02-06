import path from "node:path";
import fs, { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

import { test, expect } from '../fixtures';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

type Account = {username: string, password: string, uid: number};







//Runs with a per-test storageState, in locale "cimode"
test.use({ storageState: { cookies: [], origins: [] }, locale: "cimode" });

test.beforeEach(async ({page, uniqueAccount:{username, password}})=>{
  let res = await page.request.post("/auth/login", {
    data: JSON.stringify({username, password}),
    headers:{
      "Content-Type": "application/json",
    }
  });
  expect(res.status()).toEqual(200);
})



test("can read user settings page", async function({page}){
  await page.goto("/ui/");
  await page.getByRole("link", {"name": "testUserLogin"}).click();
  await page.waitForURL("/ui/user/");
  await expect(page.getByRole("heading", {name: "titles.userSettings"})).toBeVisible();
});


test("can change email", async ({page, uniqueAccount})=>{
  //Ensure this is unique, otherwise it is rejected
  let new_email = `${uniqueAccount.username}-replacement@example2.com`
  await page.goto("/ui/user/");
  const form = page.getByRole("form", {name: "titles.userProfile"});
  await expect(form).toBeVisible();
  const emailField = form.getByRole("textbox", {name:"labels.email"});
  await expect(emailField).not.toHaveValue(new_email);
  await emailField.fill(new_email);
  await form.getByRole("button", {name: "labels.save"}).click();

  await expect(page.getByRole("progressbar")).not.toBeVisible();
  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();

  await expect(emailField).toHaveValue(new_email);
  await page.reload();
  await expect(emailField).toHaveValue(new_email);
});

test("can change password", async ({baseURL, page, uniqueAccount:{username, password}})=>{
  const new_password = randomBytes(10).toString("base64");

  let res = await fetch(new URL(`/auth/login`, baseURL), {
    method: "GET",
    headers: {
        "Authorization":  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    }
  })
  expect(res.ok).toBeTruthy();

  await page.goto("/ui/user/");
  const form = page.getByRole("form", {name: "titles.changePassword"});
  await expect(form).toBeVisible();
  await form.getByRole("textbox", {name: "labels.newPassword"}).fill(new_password);
  await form.getByRole("button", {name: "labels.save"}).click();

  await expect(page.getByRole("progressbar")).not.toBeVisible();
  await expect(page.getByRole("alert")).not.toBeVisible();
  await expect(page.getByRole("status")).toBeVisible();

  res = await fetch(new URL(`/auth/login`, baseURL), {
    method: "GET",
    headers: {
        "Authorization":  `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
    }
  })
  expect(res.ok).toBeFalsy();

  res = await fetch(new URL(`/auth/login`, baseURL), {
    method: "GET",
    headers: {
        "Authorization":  `Basic ${Buffer.from(`${username}:${new_password}`).toString("base64")}`
    }
  })
  expect(res.ok).toBeTruthy();

});


test("can logout", async ({page})=>{

  let res = await page.request.get(`/auth/login`);
  expect(res).toBeOK();
  expect(await res.json()).toHaveProperty("isDefaultUser", false);

  await page.goto("/ui/user/");
  await page.getByRole("button", {name: "buttons.logout"}).click();
  await page.waitForURL("/ui/");
  await expect(page.getByRole("link",{name: "testUserLogin"})).not.toBeVisible();

  res = await page.request.get(`/auth/login`);
  expect(res).toBeOK();
  expect(await res.json()).toHaveProperty("isDefaultUser", true);
});

test("can show archived scenes", async ({page, uniqueAccount:{username}})=>{
  const name = randomUUID();
  const fs = await import("node:fs/promises");
  const data = await fs.readFile(path.join(fixtures, "cube.glb"))
  let res = await page.request.post(`/scenes/${encodeURIComponent(name)}`, {
    data,
    headers: {"Content-Type": "model/gltf-binary"}
  });
  await expect(res).toBeOK();

  res = await page.request.delete(`/scenes/${encodeURIComponent(name)}`);
  await expect(res).toBeOK();

  res = await page.request.get(`/scenes?archived=true&author=${username}`);
  await expect(res).toBeOK();
  const {scenes} = await res.json();
  expect(scenes).toHaveLength(1);

  await page.goto("/ui/user");

  await expect(page.getByRole("link", {name})).toBeVisible();
  await page.getByLabel('labels.restore').click();
  await expect(page.getByRole("link", {name})).not.toBeVisible();

  res = await page.request.get(`/scenes?archived=true&author=${username}`);
  await expect(res).toBeOK();
  let body = await res.json();
  expect(body.scenes).toHaveLength(0);

  res = await page.request.get(`/scenes?archived=false&author=${username}`);
  await expect(res).toBeOK();
  body = await res.json();
  console.log(name, body);
  expect(body.scenes).toHaveLength(1);
});