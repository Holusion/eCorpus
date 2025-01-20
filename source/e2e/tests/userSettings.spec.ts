import path from "node:path";
import fs, { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

import { test as _test, expect, Page, BrowserContext, APIRequestContext } from '@playwright/test';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

type Account = {username: string, password: string, uid: number};


const test = _test.extend<{account:Account}>({
  account: async ({browser}, use)=>{
    let username = `testUserLogin${randomBytes(2).readUInt16LE().toString(36)}`;
    let password = randomBytes(16).toString("base64");
    let adminContext = await browser.newContext({storageState: "playwright/.auth/admin.json"});
    //Create a user for this specific test
    let res = await  adminContext.request.post("/users", {
      data: JSON.stringify({
        username,
        email: `${username}@example.com`,
        password,
        isAdministrator: false,
      }),
      headers:{
        "Content-Type": "application/json",
      }
    });
    let body = JSON.parse(await res.text());
    expect(body).toHaveProperty("uid");
    let uid :number =body.uid;
    await use({username, password, uid});
    await adminContext.close();
  },
  page: async({page, account:{username, password}}, use)=>{
    let res = await page.request.post("/auth/login", {
      data: JSON.stringify({username, password}),
      headers:{
        "Content-Type": "application/json",
      }
    });
    expect(res.status()).toEqual(200);
    await use(page);
  },
})





//Runs with a per-test storageState, in locale "cimode"
test.use({ storageState: { cookies: [], origins: [] }, locale: "cimode" });


test("can read user settings page", async function({page}){
  await page.goto("/ui/");
  await page.getByRole("link", {"name": "testUserLogin"}).click();
  await page.waitForURL("/ui/user/");
  await expect(page.getByRole("heading", {name: "titles.userSettings"})).toBeVisible();
});


test("can change email", async ({page, account})=>{
  //Ensure this is unique, otherwise it is rejected
  let new_email = `${account.username}-replacement@example2.com`
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

test("can change password", async ({baseURL, page, account:{username, password}})=>{
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