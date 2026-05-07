import { test, expect } from '../fixtures.js';

//Runs with a per-test storageState, in locale "cimode"
test.use({ storageState: { cookies: [], origins: [] }, locale: "cimode" });

//The _actual_ route access rights are tested in unit tests
//We want to have the user properly informed and that's what we're testing here

test("can't see upload page anonymously", async function({page}){
  await page.goto("/ui/upload/");
  await expect(page.getByRole("heading", {name: "Error"})).toBeVisible();
  await expect(page.getByText('errors.requireUser')).toBeVisible();
});

test("can't see upload page as non-creator user", async function({page, uniqueAccount}){
  const {username, password} = await uniqueAccount("use");

  await page.goto("/auth/login/");
  await page.getByRole("textbox", {name: "labels.username"}).fill(username);
  await page.getByRole("textbox", {name: "labels.password"}).fill(password);
  await page.getByRole("button", {name: "labels.signin"}).click();
  await page.goto(`/ui/upload`);

  await expect(page.getByRole("heading", {name: "Error"})).toBeVisible();
  await expect(page.getByText('errors.requireCreate')).toBeVisible();

})
