import type { Page } from "@playwright/test";

import { test, expect } from '../fixtures.js';

/**
 * The bell in the navbar follows the user's activity: it counts what has settled and hasn't been read,
 * and its panel lists what's running, then what's new, live. What's read leaves it.
 * Tasks are delayTask (see tasks/handlers/delay.ts), started through the API: they have no side effects.
 * Each test has its own user, for its own notifications.
 */
test.use({ storageState: { cookies: [], origins: [] }, cimode: true });

async function login(page: Page, { username, password }: { username: string, password: string }) {
  const res = await page.request.post("/auth/login", {
    data: JSON.stringify({ username, password }),
    headers: { "Content-Type": "application/json" },
  });
  await expect(res).toBeOK();
}

/** Starts a task and answers right away: the user gets notified about it (see routes/tasks/post.ts) */
async function startDelay(page: Page, data: { ms?: number, fail?: string }): Promise<number> {
  const res = await page.request.post("/tasks", {
    data: JSON.stringify({ type: "delayTask", data }),
    headers: { "Content-Type": "application/json", "Prefer": "respond-async" },
  });
  await expect(res).toBeOK();
  return (await res.json()).task_id;
}

function bellOf(page: Page) {
  return page.getByRole("navigation").getByRole("link", { name: /nav\.notifications/ });
}

/** How many unread notifications the bell has: it isn't there when there are none */
function badgeOf(page: Page) {
  return bellOf(page).getByRole("img");
}

function panelOf(page: Page) {
  return page.locator("#nav-notifications-panel");
}

/** The browser gets messages in no language in cimode: a line tells the task's type and status instead */
function lineOf(page: Page, status: RegExp) {
  return panelOf(page).getByRole("list").getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: new RegExp(`^delayTask: ${status.source}`) }) });
}

/** Opens the panel once the bell knows what there is: there's nothing yet */
async function openEmpty(page: Page) {
  await page.goto("/ui/");
  await bellOf(page).click();
  await expect(panelOf(page).getByText("labels.noUnreadNotifications")).toBeVisible();
}

test("has what's running, counts it once it has settled, and reads it as it's followed", async ({ page, uniqueAccount }) => {
  await login(page, await uniqueAccount());
  await openEmpty(page);

  const task_id = await startDelay(page, { ms: 2000 });
  //What's running isn't counted: it's not new yet
  await expect(lineOf(page, /(pending|running)/)).toBeVisible();
  await expect(badgeOf(page)).toBeHidden();

  const settled = lineOf(page, /success/);
  await expect(settled).toBeVisible();
  await expect(lineOf(page, /(pending|running)/)).toHaveCount(0);
  await expect(badgeOf(page)).toHaveAccessibleName("1");
  await expect(panelOf(page).getByText("labels.noUnreadNotifications")).toBeHidden();

  //Following it reads it
  await settled.getByRole("link").click();
  await expect(page).toHaveURL(`/ui/tasks/${task_id}`);
  await expect(badgeOf(page)).toBeHidden();
  await page.reload();
  await bellOf(page).click();
  await expect(panelOf(page).getByText("labels.noUnreadNotifications")).toBeVisible();
  await expect(badgeOf(page)).toBeHidden();
});

test("reads them from the panel, one at a time or all at once", async ({ page, uniqueAccount }) => {
  await login(page, await uniqueAccount());
  await openEmpty(page);

  await startDelay(page, { fail: "As planned" });
  await startDelay(page, {});
  await startDelay(page, {});
  await expect(badgeOf(page)).toHaveAccessibleName("3");
  const failed = lineOf(page, /error/);
  await expect(failed).toBeVisible();
  await expect(lineOf(page, /success/)).toHaveCount(2);

  await failed.getByRole("button", { name: "buttons.markAsRead" }).click();
  await expect(failed).toHaveCount(0);
  await expect(badgeOf(page)).toHaveAccessibleName("2");
  await expect(lineOf(page, /success/)).toHaveCount(2);

  const markAll = panelOf(page).getByRole("button", { name: "buttons.markAllAsRead" });
  await markAll.click();
  await expect(panelOf(page).getByText("labels.noUnreadNotifications")).toBeVisible();
  await expect(lineOf(page, /success/)).toHaveCount(0);
  await expect(markAll).toBeHidden();
  await expect(badgeOf(page)).toBeHidden();

  //The server has it too
  await page.reload();
  await expect(bellOf(page)).toBeVisible();
  await bellOf(page).click();
  await expect(panelOf(page).getByText("labels.noUnreadNotifications")).toBeVisible();
  await expect(badgeOf(page)).toBeHidden();
});
