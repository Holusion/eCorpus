import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";

import { test, expect } from '../fixtures.js';

const fixtures = path.resolve(import.meta.dirname, "../__test_fixtures");

/**
 * What the upload page starts is followed as a notification: a toast tells how it's going, the bell has it,
 * and the upload page lists it, live, until it's been read. Each test has its own user, for its own notifications.
 */
test.use({ storageState: { cookies: [], origins: [] }, cimode: true });

/** The browser gets messages in no language in cimode (see utils/locals.ts): it tells the task's type and status instead */
const toastOf = (page: Page, status: RegExp) => page.locator("toast-stack").getByText(new RegExp(`^createSceneFromFiles: ${status.source}$`));

async function login(page: Page, { username, password }: { username: string, password: string }) {
  const res = await page.request.post("/auth/login", {
    data: JSON.stringify({ username, password }),
    headers: { "Content-Type": "application/json" },
  });
  await expect(res).toBeOK();
}

/** Uploads a glb, then asks for a scene of it */
async function createScene(page: Page, name: string) {
  await page.locator('input[type="file"]').setInputFiles(path.join(fixtures, "cube.glb"));
  await expect(page.getByRole("listitem").getByText("✓")).toBeVisible();
  const form = page.getByRole("form", { name: "titles.createOrUpdateScene" });
  await form.getByRole("textbox", { name: "labels.sceneName" }).fill(name);
  await page.getByRole("button", { name: "buttons.uploadScene" }).click();
}

function uploadsOf(page: Page) {
  return page.getByRole("region", { name: "titles.createdScenes" });
}

/** The line of a notification that has a link of that name: not the list of scenes in it */
function lineWith(page: Page, name: string | RegExp) {
  return uploadsOf(page).getByRole("listitem")
    .filter({ has: page.getByRole("link", { name, exact: typeof name === "string" }) })
    .filter({ has: page.locator("time") });
}

test("shows a scene being made, from the toast to the upload page, without reloading", async ({ page, uniqueAccount }) => {
  await login(page, await uniqueAccount("create"));
  //What the stream says comes later: until then, all there is to tell is that it's running
  await page.route("**/users/*/activity", (route) => route.abort());
  await page.goto("/ui/upload");
  const uploads = uploadsOf(page);
  await expect(uploads).toBeHidden();

  const name = randomUUID();
  await createScene(page, name);

  //It doesn't wait for the scene: the upload form is ready for something else
  await expect(page.getByText("labels.selectFile_s")).toBeVisible();
  await expect(page.getByRole("listitem").getByText("✓")).toHaveCount(0);
  await expect(toastOf(page, /(pending|running)/)).toBeVisible();
  //The upload page has it, whatever the stream says
  await expect(uploads).toBeVisible();
  await expect(uploads.getByRole("listitem")).not.toHaveCount(0);

  //The stream's back: the bell's panel tries again as soon as it's opened
  await page.unroute("**/users/*/activity");
  const bell = page.getByRole("link", { name: "nav.notifications" });
  await bell.click();
  const panel = page.locator("#nav-notifications-panel");
  await expect(panel.getByRole("link", { name: /createSceneFromFiles/ })).toBeVisible();

  //The same toast, now that it's done
  await expect(toastOf(page, /success/)).toBeVisible();
  await expect(toastOf(page, /(pending|running)/)).toHaveCount(0);

  //And on the upload page, what came out of it
  await page.keyboard.press("Escape");
  const scene = uploads.getByRole("link", { name, exact: true });
  await expect(scene).toBeVisible();
  const line = lineWith(page, name);
  await expect(line.getByRole("link", { name: "labels.view" })).toHaveAttribute("href", `/ui/scenes/${name}/view`);
  await expect(line.getByRole("link", { name: "labels.edit" })).toHaveAttribute("href", `/ui/scenes/${name}/edit`);
  await scene.click();
  await expect(page).toHaveURL(`/ui/scenes/${name}`);
});

test("keeps what's been made on the upload page until it's read", async ({ page, uniqueAccount }) => {
  await login(page, await uniqueAccount("create"));
  await page.goto("/ui/upload");
  const name = randomUUID();
  await createScene(page, name);

  const uploads = uploadsOf(page);
  const scene = uploads.getByRole("link", { name, exact: true });
  //Live: the page isn't reloaded for it
  await expect(scene).toBeVisible();
  await expect(toastOf(page, /success/)).toBeVisible();

  await page.reload();
  await expect(scene).toBeVisible();
  await page.goto("/ui/");
  await page.goto("/ui/upload");
  await expect(scene).toBeVisible();

  await lineWith(page, name).getByRole("button", { name: "buttons.markAsRead" }).click();
  await expect(scene).toHaveCount(0);
  //Nothing else is there
  await expect(uploads).toBeHidden();
  await page.reload();
  await expect(uploads).toBeHidden();
  //It's still in the page of notifications
  await page.goto("/ui/user/notifications");
  await expect(page.getByRole("listitem").filter({ has: page.locator("time") })).toHaveCount(1);
});

test("tells why a scene couldn't be made", async ({ page, uniqueAccount }) => {
  await login(page, await uniqueAccount("create"));
  //A scene of that name exists already
  const name = randomUUID();
  const res = await page.request.post(`/scenes/${name}`, { data: await fs.readFile(path.join(fixtures, "cube.glb")) });
  await expect(res).toBeOK();

  await page.goto("/ui/upload");
  await createScene(page, name);
  await expect(toastOf(page, /error/)).toBeVisible();

  const uploads = uploadsOf(page);
  const failed = uploads.getByRole("link", { name: /createSceneFromFiles/ });
  await expect(failed).toBeVisible();
  const line = lineWith(page, /createSceneFromFiles/);
  //Errors aren't translated in cimode
  const why = line.getByText(`A scene named ${name} already exists`);
  await expect(why).toBeVisible();
  await expect(line.getByRole("link", { name: "labels.view" })).toHaveCount(0);

  //As it is after a reload
  await page.reload();
  await expect(why).toBeVisible();
  await failed.click();
  await expect(page).toHaveURL(/\/ui\/tasks\/\d+$/);
  //Following it has read it
  await page.goto("/ui/upload");
  await expect(uploads).toBeHidden();
});

test("has a line for each scene of an archive, which are read together", async ({ page, uniqueAccount }) => {
  await login(page, await uniqueAccount("create"));
  const names = [randomUUID(), randomUUID()];
  for (const name of names) {
    const res = await page.request.post(`/scenes/${name}`, { data: await fs.readFile(path.join(fixtures, "cube.glb")) });
    await expect(res).toBeOK();
  }
  let res = await page.request.get(`/scenes?${names.map(n => `name=${n}`).join("&")}`, { headers: { "Accept": "application/zip" } });
  await expect(res).toBeOK();
  const body = await res.body();
  //It's made again
  res = await page.request.delete(`/scenes/${names[0]}`);
  await expect(res).toBeOK();

  await page.goto("/ui/upload");
  await page.locator('input[type="file"]').setInputFiles({ name: "scenes.zip", mimeType: "application/zip", buffer: body });
  await page.getByRole("button", { name: "buttons.uploadArchive" }).click();

  const uploads = uploadsOf(page);
  const created = uploads.getByRole("link", { name: names[0], exact: true });
  const updated = uploads.getByRole("link", { name: names[1], exact: true });
  await expect(created).toHaveAttribute("href", `/ui/scenes/${names[0]}`);
  await expect(updated).toHaveAttribute("href", `/ui/scenes/${names[1]}`);
  await expect(lineWith(page, names[0]).getByText("notifications.upload.created")).toBeVisible();
  await expect(lineWith(page, names[1]).getByText("notifications.upload.updated")).toBeVisible();
  const lines = uploads.getByRole("listitem");
  await expect(lines).toHaveCount(3);
  //The import's own first, which is the only one that can be marked
  await expect(lines.first().getByRole("link", { name: /extractScenesArchives/ })).toBeVisible();
  await expect(uploads.getByRole("button", { name: "buttons.markAsRead" })).toHaveCount(1);
  for (const name of names) {
    await expect(lineWith(page, name).getByRole("link", { name: "labels.view" })).toHaveAttribute("href", `/ui/scenes/${name}/view`);
  }

  //Seeing a scene doesn't read the others
  await created.click();
  await expect(page).toHaveURL(`/ui/scenes/${names[0]}`);
  await page.goBack();
  await expect(lines).toHaveCount(3);

  await uploads.getByRole("button", { name: "buttons.markAsRead" }).click();
  await expect(lines).toHaveCount(0);
  await expect(uploads).toBeHidden();
  await page.reload();
  await expect(uploads).toBeHidden();
});
