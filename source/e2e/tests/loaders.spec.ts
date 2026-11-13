import type { Locator } from "@playwright/test";
import { test, expect } from '../fixtures.js';

/**
 * A form being sent shows the app's loader on what sent it (see SubmitFragment.ts).
 * The design page's demo forms are answered after 3 seconds, without going anywhere.
 */
test.use({ storageState: 'playwright/.auth/admin.json' });

async function within(inner: Locator, outer: Locator) {
  const a = (await inner.boundingBox())!, b = (await outer.boundingBox())!;
  expect(a.x).toBeGreaterThanOrEqual(b.x - 1);
  expect(a.y).toBeGreaterThanOrEqual(b.y - 1);
  expect(a.x + a.width).toBeLessThanOrEqual(b.x + b.width + 1);
  expect(a.y + a.height).toBeLessThanOrEqual(b.y + b.height + 1);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/ui/design");
});

test("shows the loader in place of the button that sent a form", async ({ page }) => {
  const demo = page.locator(`.demo-frame[data-label="submit-fragment, sent by a button"]`);
  const save = demo.getByRole("button", { name: "Save" });
  await save.click();
  const loader = demo.getByRole("progressbar");
  await expect(loader).toBeVisible();
  //Where the button is, which is out of sight meanwhile
  expect(await loader.boundingBox()).toEqual(await save.boundingBox());
  await expect(save).toHaveCSS("opacity", "0");
  //Back once it's answered
  await expect(loader).toHaveCount(0);
  await expect(save).toHaveCSS("opacity", "1");
});

test("shows the loader at the end of the field whose change sent a form", async ({ page }) => {
  const demo = page.locator(`.demo-frame[data-label="submit-fragment, sent by a change"]`);
  const level = demo.getByRole("combobox", { name: "Level" });
  await level.selectOption("admin");
  const loader = demo.getByRole("progressbar");
  await expect(loader).toBeVisible();
  await within(loader, level);
  //What's in it can still be read
  const field = (await level.boundingBox())!, at = (await loader.boundingBox())!;
  expect(at.x).toBeGreaterThan(field.x + field.width / 2);
  await expect(level).toHaveCSS("opacity", "1");
  await expect(loader).toHaveCount(0);
});
