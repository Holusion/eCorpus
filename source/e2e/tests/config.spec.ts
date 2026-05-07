import { expect, test } from '../fixtures.js';

//Authenticated as admin
test.use({ storageState: 'playwright/.auth/admin.json', locale: "cimode" });

//Ensure mode is "serial" otherwise we'd have race conditions
test.describe.configure({ mode: 'serial' });

test("can change a config option", async ({page, request})=>{
  //We expect whatever value at the start, that may or may not be an empty string
  //so we should be resilient to isolation errors
  await page.goto("/ui/admin/");
  const t = page.getByRole("table", {name: "titles.config"});
  const brand_row = t.locator("tr").filter({has: page.locator("td[title='brand']")});
  await expect(brand_row).toBeVisible();
  await brand_row.getByRole("button", {name: "labels.edit"}).click();
  const save_btn = brand_row.getByRole("button", {name: "labels.save"})
  await expect(save_btn).toBeVisible();
  await brand_row.getByRole("textbox").fill("Hello World");
  await save_btn.click();
  await expect(save_btn).not.toBeVisible();
  await expect(page).toHaveTitle("Administration — Hello World — eCorpus");
  const res = await request.get("/admin/config");
  const config = await res.json();
  expect(config).toHaveProperty("brand", {
    value: "Hello World",
    locked: false,
    type: "text",
    defaultValue: "",
  })
});

test("can reset a config option", async ({page, request})=>{
  await page.goto("/ui/admin/");
  const t = page.getByRole("table", {name: "titles.config"});
  const brand_row = t.locator("tr").filter({has: page.locator("td[title='brand']")});
  await brand_row.getByRole("button", {name: "labels.edit"}).click();
  await brand_row.getByRole("textbox").fill("Hello World");
  await brand_row.getByRole("button", {name: "labels.restore"}).click()
  const save_btn = brand_row.getByRole("button", {name: "labels.save"});
  await save_btn.click();
  await expect(save_btn).not.toBeVisible();

  await expect(page).toHaveTitle("Administration — eCorpus");
  await expect(brand_row.getByRole("textbox")).toHaveValue("");
  const res = await request.get("/admin/config");
  const config = await res.json();
  expect(config).toHaveProperty("brand", {
    value: "",
    locked: false,
    type: "text",
    defaultValue: "",
  });
});

test("can toggle checkboxes", async ({page, request})=>{
  let res = await request.get("/admin/config");
  let {verbose: verbose_initial} = await res.json();

  expect(verbose_initial).toHaveProperty("value");
  expect(typeof verbose_initial.value).toEqual("boolean")

  await page.goto("/ui/admin/");

  const t = page.getByRole("table", {name: "titles.config"});

  const brand_row = t.locator("tr").filter({has: page.locator("td[title='verbose']")});
  await brand_row.getByRole("button", {name: "labels.edit"}).click();
  await brand_row.getByRole("checkbox").click();
  const save_btn = brand_row.getByRole("button", {name: "labels.save"});
  await save_btn.click();
  await expect(save_btn).not.toBeVisible();


  res = await request.get("/admin/config");
  const config = await res.json();
  expect(config).toHaveProperty("verbose", {
    value: !verbose_initial.value,
    locked: false,
    type: "checkbox",
    defaultValue: verbose_initial.defaultValue,
  });
});