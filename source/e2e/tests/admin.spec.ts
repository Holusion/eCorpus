import { expect, test } from '../fixtures.js';
import { randomBytes, randomUUID } from "node:crypto";

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/admin.json', cimode: true });



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
  const row = page.getByRole("listitem", {name});
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
  await expect(page.getByRole("listitem", {name})).toHaveCount(0);
});

test.describe("tasks list", ()=>{
  /** Creates a user that has a task of its own: its onboarding email */
  async function userWithTask(request: import("@playwright/test").APIRequestContext, prefix: string){
    const username = `${prefix}-${randomBytes(6).toString("base64url")}`;
    const res = await request.post("/users", {
      data: {username, email: `${username}@example.com`, password: randomUUID(), level: "use", send_onboarding: true},
    });
    await expect(res).toBeOK();
    return username;
  }

  test("can be filtered by a type, from suggestions", async ({page, request})=>{
    const owner = await userWithTask(request, "test-tasktype");
    await page.goto("/ui/admin/tasks");
    const type = page.getByRole("combobox", {name: "fields.type"});
    //Native suggestions aren't part of the page: what they'd offer is in its list
    const list = await type.getAttribute("list");
    await expect(page.locator(`#${list} option[value="sendEmail"]`)).toHaveCount(1);
    await type.fill("sendEmail");
    await type.press("Enter");
    await expect(page).toHaveURL(new RegExp(`[?&]type=sendEmail(&|$)`));
    await expect(page.getByRole("combobox", {name: "fields.type"})).toHaveValue("sendEmail");
    await expect(page.getByRole("listitem", {name: owner})).toBeVisible();
  });

  test("can be paged through, with its filters", async ({page, request})=>{
    await userWithTask(request, "test-taskpage");
    await userWithTask(request, "test-taskpage");
    await page.goto("/ui/admin/tasks?type=sendEmail&limit=1");
    await expect(page.getByRole("listitem", {name: /sendEmail/})).toHaveCount(1);
    await expect(page.getByRole("link", {name: "buttons.previous"})).toHaveCount(0);
    await page.getByRole("link", {name: "buttons.next"}).click();
    await expect(page).toHaveURL(/[?&]offset=1(&|$)/);
    await expect(page).toHaveURL(/[?&]type=sendEmail(&|$)/);
    await expect(page.getByRole("listitem", {name: /sendEmail/})).toHaveCount(1);
    await page.getByRole("link", {name: "buttons.previous"}).click();
    await expect(page).toHaveURL(/[?&]offset=0(&|$)/);
  });

  test("links the owner of each task to their tasks", async ({page, request})=>{
    const owner = await userWithTask(request, "test-taskownerlink");
    await page.goto("/ui/admin/tasks?type=sendEmail&status=all");
    await page.getByRole("listitem", {name: owner}).getByRole("link", {name: owner, exact: true}).click();
    //The user's own list of tasks, as they see it
    await expect(page).toHaveURL(/\/ui\/users\/\d+\/tasks\?type=sendEmail$/);
    await expect(page.getByRole("heading", {name: new RegExp(`titles.userSettings — ${owner}`)})).toBeVisible();
    await expect(page.getByRole("link", {name: /sendEmail/})).toBeVisible();
  });
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