import { test as setup, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';

const adminFile = 'playwright/.auth/admin.json';
const userFile = "playwright/.auth/user.json";
setup.use({
  locale: "en-US",
});
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
    let res = await fetch("http://localhost:8000/users", {
      headers: {
        "Authorization":  `Basic ${Buffer.from(`testAdmin:12345678`).toString("base64")}`
      }
    });
    expect(res.status).toEqual(200);
  }else{
    expect(res.status()).toEqual(201);
  }
});

setup('authenticate as admin', async ({ request }) => {
  //Create administrator
  const username = `testAdmin${randomBytes(2).readUInt16LE().toString(36)}`;
  const password = randomBytes(16).toString("base64");
  let res = await fetch("http://localhost:8000/users", {
    method: "POST",
    body: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password,
      level: "admin",
    }),
    headers:{
      "Content-Type": "application/json",
      "Authorization":  `Basic ${Buffer.from(`testAdmin:12345678`).toString("base64")}`
    }
  });
  expect(res.status).toEqual(201);

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
  let res = await request.post("/users", {
    data: JSON.stringify({
      username,
      email: `${username}@example.com`,
      password,
      level: "create",
    }),
    headers:{
      "Content-Type": "application/json",
      "Authorization":  `Basic ${Buffer.from(`testAdmin:12345678`).toString("base64")}`
    }
  });
  expect(res.status()).toEqual(201);

  res = await request.post("/auth/login", {
    data: JSON.stringify({username, password}),
    headers:{
      "Content-Type": "application/json",
    }
  });
  expect(res.status()).toEqual(200);
  await request.storageState({ path: userFile });
})