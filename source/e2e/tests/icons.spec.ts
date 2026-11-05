import { test, expect } from '../fixtures.js';

//The navigation's toggle only shows on narrow screens
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 400, height: 800 } });

test("draws icons without waiting for the main bundle", async ({page})=>{
  await page.route("**/dist/js/corpus.js*", (route)=> route.abort());
  await page.goto("/ui/tags/");
  //Icons are hidden from assistive technologies: they have nothing else to go by
  const toggle = page.getByRole("button", {name: "Toggle navigation"});
  await expect(toggle.locator('svg use[href$="#icon-plus"]')).toBeAttached();
  await expect(toggle.locator('svg use[href$="#icon-minus"]')).toBeAttached();
});
