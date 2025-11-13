import path from "node:path";
import fs, { readFile } from "node:fs/promises";
import { randomBytes, randomUUID } from "node:crypto";

import { test, expect } from '../fixtures';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");


//Runs with a per-test storageState, in locale "cimode"
test.use({ storageState: { cookies: [], origins: [] }, locale: "cimode" });

//The _actual_ route access rights are tested in unit tests
//We want to have the user properly informed and that's what we're testing here

test("can't access upload page anonymously", async function({page}){

  await page.goto("/ui/upload/");
  await expect(page.getByText("[401] Unauthorized", {exact: true})).toBeVisible();
});
