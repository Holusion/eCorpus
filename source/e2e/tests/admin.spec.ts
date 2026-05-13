import { expect, test } from '../fixtures.js';
import { randomBytes, randomUUID } from "node:crypto";

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/admin.json', locale: "cimode" });



test("can create a new user", async ({page})=>{
  let name = `test-createuser-${randomBytes(6).toString("base64url")}`;
  await page.goto(`/ui/admin/users?match=${encodeURIComponent(name)}`);
  let password = randomUUID();
  let email = `${name}@example.com`;
  await page.getByRole("button", {name: "labels.createUser"}).click();
  const form = page.getByRole("dialog", {name: "labels.createUser"});
  await expect(form).toBeVisible();
  await form.getByRole("textbox", {name: "labels.username"}).fill(name);
  await form.getByRole("textbox", {name: "password"}).fill(password);
  await form.getByRole("textbox", {name: "email"}).fill(email);
  await form.getByRole("combobox", {name: ""}).selectOption("manage");
  await form.getByRole("button", {name: "buttons.submit"}).click();

  await expect(page.getByRole("table").getByText(name, {exact: true})).toBeVisible();
});

test("shows the email of users in the admin users list", async ({page, request})=>{
  let username = `test-emailcol-${randomBytes(6).toString("base64url")}`;
  let email = `${username}@example.com`;
  let res = await request.post("/users", {
    data: {username, password: randomUUID(), email},
  });
  await expect(res).toBeOK();

  await page.goto(`/ui/admin/users?match=${encodeURIComponent(username)}`);

  let userRow = page.getByRole("row", {name: username});
  await expect(userRow).toBeVisible();
  await expect(userRow.getByRole("link", {name: email})).toBeVisible();
});

test("schedules an onboarding email when send_onboarding is checked", async ({page})=>{
  await page.goto("/ui/admin/users");
  let name = `test-onboarding-${randomBytes(6).toString("base64url")}`;
  let password = randomUUID();
  let email = `${name}@example.com`;
  await page.getByRole("button", {name: "labels.createUser"}).click();
  const form = page.getByRole("dialog", {name: "labels.createUser"});
  await expect(form).toBeVisible();
  await form.getByRole("textbox", {name: "labels.username"}).fill(name);
  await form.getByRole("textbox", {name: "password"}).fill(password);
  await form.getByRole("textbox", {name: "email"}).fill(email);
  await form.getByRole("checkbox", {name: "labels.sendOnboardingEmail"}).check();
  await form.getByRole("button", {name: "buttons.submit"}).click();

  // After form submit the page reloads on the users list. Now check the
  // tasks list to confirm an onboarding sendEmail task was created.
  await page.goto("/ui/admin/tasks?type=sendEmail&status=all");
  const row = page.getByRole("row", {name: new RegExp(name)});
  await expect(row).toBeVisible();
  await expect(row).toContainText("sendEmail");
});

test("does not schedule an onboarding email when the checkbox is not ticked", async ({page, request})=>{
  let name = `test-no-onboarding-${randomBytes(6).toString("base64url")}`;
  // Plain JSON POST without send_onboarding -> no task.
  let res = await request.post("/users", {
    data: {
      username: name,
      email: `${name}@example.com`,
      password: randomUUID(),
      level: "use",
    },
  });
  await expect(res).toBeOK();

  await page.goto("/ui/admin/tasks?type=sendEmail&status=all");
  await expect(page.getByRole("row", {name: new RegExp(name)})).toHaveCount(0);
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

  await page.goto(`/ui/admin/users?match=${encodeURIComponent(username)}`);

  let userRow = page.getByRole("row", {name: username});
  await expect(userRow).toBeVisible();
  await userRow.getByRole("button", {name: "labels.delete"}).click();

  await expect(userRow).not.toBeVisible();
});

test("can force-delete archived scenes", async ({page, request, createScene})=>{

  const name = await createScene();

  let res = await page.request.delete(`/scenes/${encodeURIComponent(name)}?archive=true`);
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

test("can restore archived scenes", async ({page, request, createScene})=>{

  const name = await createScene();

  let res = await page.request.delete(`/scenes/${encodeURIComponent(name)}?archive=true`);
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