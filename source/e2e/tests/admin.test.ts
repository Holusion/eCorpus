import path from "node:path";


import { test } from '@playwright/test';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/admin.json' });



test.skip("can create a new user", async ({page})=>{
  await page.goto("/ui/admin/users");

});

test.skip("can delete a non-admin user", async ({page})=>{

});

