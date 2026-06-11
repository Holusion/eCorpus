import { test as setup, expect, type APIRequestContext } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const adminFile = 'playwright/.auth/admin.json';
const userFile = "playwright/.auth/user.json";
setup.use({
  locale: "en-US",
});
// The three setup tests below have a hard ordering dependency: the
// "create superAdmin account" step bootstraps testAdmin:12345678,
// which the two "authenticate as ..." steps then log in as to create
// their own randomized accounts (Basic auth is not supported anymore:
// bootstrap requests authenticate with a session cookie).
// Force them serial so workers > 1 in the project config doesn't race.
setup.describe.configure({ mode: 'serial' });

/** Log the request context in as the bootstrap admin (session cookie) */
async function loginAsTestAdmin(request: APIRequestContext){
  const res = await request.post("/auth/login", {
    data: JSON.stringify({username: "testAdmin", password: "12345678"}),
    headers: {
      "Content-Type": "application/json",
    }
  });
  expect(res.status()).toEqual(200);
}

/**
 * To provide reasonable isolation on each test run, this setup uses a "master" admin account to create 2 new randomized
 */
setup("create superAdmin account", async ({request})=>{
  //Expect instance to be in open mode
  let res = await request.post("/users", {
    data: JSON.stringify({
      username: "testAdmin",
      email: "testAdmin@example.com",
      password: "12345678",
      level: "admin",
    }),
    headers:{
      "Content-Type": "application/json",
    }
  });

  if(res.status() == 401){
    //Happens when setup is run multiple times against the same dev server
    //ie. in watch mode
    await loginAsTestAdmin(request);
    let check = await request.get("/users");
    expect(check.status()).toEqual(200);
  }else{
    expect(res.status()).toEqual(201);
  }
});

setup('authenticate as admin', async ({ request }) => {
  //Create administrator
  const username = `testAdmin${randomBytes(2).readUInt16LE().toString(36)}`;
  const password = randomBytes(16).toString("base64");
  await loginAsTestAdmin(request);
  let res = await request.post("/users", {
    data: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password,
      level: "admin",
    }),
    headers:{
      "Content-Type": "application/json",
    }
  });
  expect(res.status()).toEqual(201);

  //Log in as the new administrator: replaces the bootstrap session cookie
  let post = await request.post("/auth/login", {
    data: JSON.stringify({username, password}),
    headers:{
      "Content-Type": "application/json",
    }
  });
  expect(post.status()).toEqual(200);
  await request.storageState({ path: adminFile });
});

setup("authenticate as user", async ({request})=>{
  const username = `testUser${randomBytes(2).readUInt16LE().toString(36)}`;
  const password = randomBytes(16).toString("base64");
  await loginAsTestAdmin(request);
  let res = await request.post("/users", {
    data: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password,
      level: "create",
    }),
    headers:{
      "Content-Type": "application/json",
    }
  });
  expect(res.status()).toEqual(201);

  //Log in as the new user: replaces the bootstrap session cookie
  res = await request.post("/auth/login", {
    data: JSON.stringify({username, password}),
    headers:{
      "Content-Type": "application/json",
    }
  });
  expect(res.status()).toEqual(200);
  await request.storageState({ path: userFile });
})
