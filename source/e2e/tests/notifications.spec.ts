import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import type { BrowserContext, Page, Request } from "@playwright/test";

import { test, expect } from "../fixtures.js";

const STREAM = /\/events\/users\/\d+$/;
const PAGE = "/ui/tags/";

//Logged-in users each get an account of their own, for their inbox not to depend on other tests
test.use({ storageState: { cookies: [], origins: [] } });


async function login(context: BrowserContext, {username, password}: {username: string, password: string}){
  const res = await context.request.post("/auth/login", {
    data: JSON.stringify({username, password}),
    headers: {"Content-Type": "application/json"},
  });
  await expect(res).toBeOK();
}

/**
 * Starts an upload that won't complete, which keeps a task running until it's told to leave.
 * The task's event tells us that the server has seen it, so it also tells that a page's stream is working.
 */
async function startUpload(page: Page, baseURL: string){
  const scene = randomUUID();
  const started = page.evaluate(()=> new Promise<void>((resolve)=>{
    document.addEventListener("task-event", (e)=>{
      if((e as CustomEvent).detail.type === "postScene") resolve();
    });
  }));
  const cookie = (await page.context().cookies()).map(c=> `${c.name}=${c.value}`).join("; ");
  const req = http.request(new URL(`/scenes/${scene}`, baseURL), {
    method: "POST",
    headers: {Cookie: cookie, "Content-Type": "application/octet-stream", "Content-Length": "1000000"},
  });
  req.on("error", ()=>{});
  req.write("incomplete");
  await started;
  return {scene, leave: ()=> req.destroy()};
}

/** Makes the server create a notification, the way it happens for real: by leaving during an upload */
async function abandonUpload(page: Page, baseURL: string){
  const {scene, leave} = await startUpload(page, baseURL);
  leave();
  return scene;
}

/** Opens a page, and returns once its stream is connected */
async function open(page: Page, url: string){
  const connected = page.waitForResponse(res=> STREAM.test(res.url()));
  await page.goto(url);
  await connected;
}

/** Requests made to the stream by a page */
function streamRequests(page: Page){
  const requests: Request[] = [];
  page.on("request", (req)=>{
    if(STREAM.test(req.url())) requests.push(req);
  });
  return requests;
}

/**
 * That no other request has been made. It takes a moment to hear of one that was,
 * so checking right after moving the clock would always pass.
 */
async function expectRequests(page: Page, requests: Request[], count: number, message?: string){
  await page.waitForTimeout(100);
  expect(requests, message).toHaveLength(count);
}

const snapshot = (unread: number, unread_errors = 0)=> `event: snapshot\ndata: ${JSON.stringify({tasks: [], unread, unread_errors})}\n\n`;

/** Hides the page, as far as it can tell */
async function setHidden(page: Page, hidden: boolean){
  await page.evaluate((hidden)=>{
    Object.defineProperty(document, "hidden", {value: hidden, configurable: true});
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}


test.describe("for anonymous visitors", ()=>{
  test("has no client at all", async ({page})=>{
    const scripts: string[] = [];
    page.on("request", (req)=> { scripts.push(req.url()); });
    await page.goto(PAGE);
    await expect(page.locator("main")).toBeVisible();
    expect(scripts.filter(url=> url.includes("events"))).toEqual([]);
    await expect(page.locator("#nav-notifications")).toHaveCount(0);
  });
});


test.describe("for logged-in users", ()=>{
  test.beforeEach(async ({context, uniqueAccount})=>{
    await login(context, await uniqueAccount("create"));
  });

  test("a task that finishes after its client left shows a toast and a badge", async ({page, baseURL})=>{
    await open(page, PAGE);
    const badge = page.locator("#nav-notifications .nav-badge");
    await expect(page.locator("#nav-notifications"), "the way to the inbox is always there").toBeVisible();
    await expect(badge, "there's nothing to read yet").toBeHidden();

    const scene = await abandonUpload(page, baseURL!);

    const toast = page.locator(".notification-error");
    await expect(toast).toContainText(`Creation of scene ${scene} has failed`);
    await expect(toast.locator("a")).toHaveAttribute("href", /^\/ui\/tasks\/\d+$/);
    await expect(badge).toHaveAttribute("data-count", "1");

    //Showing it didn't count as reading it, and only what's new gets a toast
    await open(page, PAGE);
    await expect(badge).toHaveAttribute("data-count", "1");
    await expect(page.locator(".notification")).toHaveCount(0);
  });

  test("notifications can be marked as read, one at a time", async ({page, baseURL})=>{
    await open(page, PAGE);
    await abandonUpload(page, baseURL!);
    await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
    await abandonUpload(page, baseURL!);
    await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "2");

    await open(page, "/ui/user/notifications");
    const badge = page.locator("#nav-notifications .nav-badge");
    const unread = page.locator(".inbox-item.unread");
    await expect(badge, "looking at the list isn't reading it").toHaveAttribute("data-count", "2");
    await expect(unread).toHaveCount(2);

    await unread.first().locator(".inbox-mark-read").click();
    await expect(unread).toHaveCount(1);
    await expect(badge).toHaveAttribute("data-count", "1");

    //It's on the server, not in this page
    await open(page, "/ui/user/notifications");
    await expect(badge).toHaveAttribute("data-count", "1");
    await expect(page.locator(".inbox-item")).toHaveCount(2);
    await expect(unread).toHaveCount(1);
  });

  test("following a notification marks it as read", async ({page, baseURL})=>{
    await open(page, PAGE);
    await abandonUpload(page, baseURL!);
    await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");

    await open(page, "/ui/user/notifications");
    await page.locator(".inbox-item.unread a.inbox-item-message").click();
    await page.waitForURL(/\/ui\/tasks\/\d+$/);

    await open(page, "/ui/user/notifications");
    await expect(page.locator(".inbox-item")).toHaveCount(1);
    await expect(page.locator(".inbox-item.unread")).toHaveCount(0);
    await expect(page.locator("#nav-notifications .nav-badge")).toBeHidden();
  });

  test("cuts long titles on the page of notifications, and gives them in full on demand", async ({page, baseURL})=>{
    await open(page, PAGE);
    await abandonUpload(page, baseURL!);
    await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
    await page.setViewportSize({width: 390, height: 700});
    await open(page, "/ui/user/notifications");
    const title = page.locator(".inbox-item-message");
    const text = await title.innerText();
    await expect(title).toHaveAttribute("title", text);
    const {cut, height, lineHeight} = await title.evaluate(el=> ({
      cut: el.scrollWidth - el.clientWidth,
      height: el.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(el).fontSize) * 2,
    }));
    expect(cut, "it doesn't fit").toBeGreaterThan(0);
    expect(height, "on one line").toBeLessThan(lineHeight);
    const overflow = await page.evaluate(()=> document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "no scrolling sideways").toBeLessThanOrEqual(0);
  });

  test("all notifications can be marked as read at once", async ({page, baseURL})=>{
    await open(page, PAGE);
    await abandonUpload(page, baseURL!);
    await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
    await abandonUpload(page, baseURL!);
    await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "2");

    await open(page, "/ui/user/notifications");
    await page.locator("#inbox-mark-all").click();
    await expect(page.locator(".inbox-item.unread")).toHaveCount(0);
    await expect(page.locator("#inbox-mark-all")).toHaveCount(0);
    await expect(page.locator("#nav-notifications .nav-badge")).toBeHidden();

    await open(page, "/ui/user/notifications");
    await expect(page.locator(".inbox-item.unread")).toHaveCount(0);
    await expect(page.locator("#nav-notifications .nav-badge")).toBeHidden();
  });

  test.describe("list from the bell", ()=>{
    const panel = (page: Page)=> page.locator("#nav-notifications-panel");
    const bell = (page: Page)=> page.locator("#nav-notifications");
    const markAll = (page: Page)=> panel(page).getByRole("button", {name: "mark all as read"});
    //Toasts also ask for what's unread
    const isListing = (url: string)=> url.includes("/notifications?status=unread&limit=");

    /** Clicks on the bell, and waits for what this does to happen */
    async function openList(page: Page){
      const listed = page.waitForResponse(res=> isListing(res.url()));
      await bell(page).click();
      await listed;
      await expect(panel(page)).toBeVisible();
    }

    async function withNotification(page: Page, baseURL: string){
      await open(page, PAGE);
      const scene = await abandonUpload(page, baseURL);
      await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
      return scene;
    }

    /** A list of any size, with no need to make that many notifications */
    async function listOf(page: Page, count: number, message: (i: number)=>string = (i)=> `Notification ${i}`, status: (i: number)=>string|null = ()=> "success"){
      await page.route(url=> isListing(url.toString()), (route)=> route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(Array.from({length: count}, (_, i)=> ({
          notification_id: count - i,
          type: "task",
          ctime: new Date().toISOString(),
          read_at: null,
          message: message(i),
          link: status(i) ? `/ui/tasks/${count - i}` : null,
          task: status(i) ? {task_id: count - i, type: "testTask", status: status(i)} : null,
          scene: null,
        }))),
      }));
    }

    test("doesn't ask for anything until it's opened", async ({page})=>{
      const requests: string[] = [];
      page.on("request", (req)=> { requests.push(req.url()); });
      await open(page, PAGE);
      await expect(panel(page)).toBeHidden();
      expect(requests.filter(url=> url.includes("/notifications"))).toEqual([]);
    });

    test("doesn't open by moving the pointer over it", async ({page, baseURL})=>{
      await withNotification(page, baseURL!);
      const requests: string[] = [];
      page.on("request", (req)=> { if(isListing(req.url())) requests.push(req.url()); });
      await bell(page).hover();
      await page.waitForTimeout(200);
      await expect(panel(page)).toBeHidden();
      expect(requests).toEqual([]);
    });

    test("opens and closes with the bell", async ({page})=>{
      await open(page, PAGE);
      await openList(page);
      await bell(page).click();
      await expect(panel(page)).toBeHidden();
      await openList(page);
      await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
    });

    test("closes by clicking elsewhere, or with Esc", async ({page})=>{
      await open(page, PAGE);
      await openList(page);
      await page.mouse.click(10, 300);
      await expect(panel(page)).toBeHidden();
      await openList(page);
      await page.keyboard.press("Escape");
      await expect(panel(page)).toBeHidden();
    });

    test("stays under its button, inside of the window", async ({page})=>{
      await open(page, PAGE);
      await listOf(page, 3);
      await openList(page);
      const [button, box] = [await bell(page).boundingBox(), await panel(page).boundingBox()];
      expect(Math.abs(box!.y - (button!.y + button!.height))).toBeLessThan(12);
      expect(Math.abs((box!.x + box!.width) - (button!.x + button!.width))).toBeLessThan(2);
      expect(box!.x).toBeGreaterThanOrEqual(0);
    });

    test("says when there's nothing new, and still leads to all notifications", async ({page})=>{
      await open(page, PAGE);
      await openList(page);
      await expect(panel(page)).toContainText("No new notifications");
      await expect(markAll(page)).toBeHidden();
      await panel(page).getByRole("link", {name: "all notifications"}).click();
      await page.waitForURL(/\/ui\/user\/notifications$/);
    });

    test("ends with its two actions, side by side, with the icon last", async ({page})=>{
      await open(page, PAGE);
      await listOf(page, 2);
      await openList(page);
      const all = panel(page).getByRole("link", {name: "all notifications"});
      const [left, right] = [await all.boundingBox(), await markAll(page).boundingBox()];
      expect(Math.abs(left!.y - right!.y)).toBeLessThan(1);
      expect(left!.x + left!.width).toBeLessThan(right!.x);
      const last = await markAll(page).evaluate(el=> el.lastElementChild?.getAttribute("name"));
      expect(last).toEqual("check-check");
      const list = await panel(page).locator("ul").boundingBox();
      expect(list!.y + list!.height).toBeLessThanOrEqual(left!.y);
    });

    test("cuts long titles on one line, and gives them in full on demand", async ({page})=>{
      const message = `Creation of scene ${"very long name ".repeat(20)}has failed`;
      await open(page, PAGE);
      await listOf(page, 2, ()=> message);
      await openList(page);
      const title = panel(page).locator("li a").first();
      const text = title.locator("span");
      await expect(text).toHaveCSS("text-overflow", "ellipsis");
      await expect(text).toHaveCSS("white-space", "nowrap");
      const {scrollWidth, clientWidth} = await text.evaluate(el=> ({scrollWidth: el.scrollWidth, clientWidth: el.clientWidth}));
      expect(scrollWidth).toBeGreaterThan(clientWidth);
      await expect(title).toHaveAttribute("title", message);
      await expect(title.locator("ui-icon"), "whatever the length of what's next to it").toBeVisible();
      const [row, short] = [await panel(page).locator("li").first().boundingBox(), await bell(page).boundingBox()];
      expect(row!.height).toBeLessThan(short!.height * 1.5);
    });

    test("starts titles with an icon for their status, in color", async ({page})=>{
      await open(page, PAGE);
      const statuses = ["error", "success", null];
      await listOf(page, 3, (i)=> `Notification ${i}`, (i)=> statuses[i]);
      await openList(page);
      const rows = panel(page).locator("li");
      const expected = [["error", "text-error"], ["check", "text-success"], ["info", "text-info"]];
      const colors = new Set<string>();
      for(const [i, [name, color]] of expected.entries()){
        const icon = rows.nth(i).locator("ui-icon").first();
        await expect(icon).toHaveAttribute("name", name);
        await expect(icon).toHaveClass(new RegExp(color));
        await expect(icon.locator("svg")).toBeVisible();
        colors.add(await icon.evaluate(el=> getComputedStyle(el).color));
        const [iconBox, textBox] = [await icon.boundingBox(), await rows.nth(i).locator("span").boundingBox()];
        expect(iconBox!.x + iconBox!.width, "before its title").toBeLessThanOrEqual(textBox!.x);
      }
      expect(colors.size, "each with its own color").toEqual(3);
      expect(colors).not.toContain(await rows.first().locator("span").evaluate(el=> getComputedStyle(el).color));
      //It's part of what can be clicked
      await expect(rows.first().locator("a ui-icon")).toHaveCount(1);
    });

    test("highlights a whole row, including under its button", async ({page})=>{
      await open(page, PAGE);
      await listOf(page, 2);
      await openList(page);
      const row = panel(page).locator("li").first();
      const color = ()=> row.evaluate(el=> getComputedStyle(el).backgroundColor);
      const button = row.getByRole("button");
      await page.mouse.move(10, 300);
      const before = await color();
      await button.hover();
      expect(await color()).not.toEqual(before);
      const [box, rowBox] = [await button.boundingBox(), await row.boundingBox()];
      expect(box!.x + box!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width);
      await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    });

    test("scrolls through a long list, and its actions stay in reach", async ({page})=>{
      await page.setViewportSize({width: 1200, height: 500});
      await open(page, PAGE);
      await listOf(page, 100);
      await openList(page);
      await expect(panel(page).locator("li")).toHaveCount(100);
      const list = panel(page).locator("ul");
      const {scrollHeight, clientHeight} = await list.evaluate(el=> ({scrollHeight: el.scrollHeight, clientHeight: el.clientHeight}));
      expect(scrollHeight).toBeGreaterThan(clientHeight);
      await expect(markAll(page)).toBeInViewport({ratio: 1});
      await expect(panel(page).locator("li").last()).not.toBeInViewport();
      await panel(page).locator("li").last().scrollIntoViewIfNeeded();
      await expect(panel(page).locator("li").last()).toBeInViewport();
    });

    test("lists what's unread, newest first, and what arrives while it's open", async ({page, baseURL})=>{
      const first = await withNotification(page, baseURL!);
      await openList(page);
      await expect(panel(page).locator("li")).toHaveCount(1);
      await expect(panel(page).locator("li")).toContainText(first);

      const second = await abandonUpload(page, baseURL!);
      await expect(panel(page).locator("li")).toHaveCount(2);
      await expect(panel(page).locator("li").first()).toContainText(second);
    });

    test("marks all as read", async ({page, baseURL, context})=>{
      await withNotification(page, baseURL!);
      await abandonUpload(page, baseURL!);
      await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "2");
      await openList(page);
      //Listing it again at that point could bring back what's being marked
      const lists: string[] = [];
      page.on("request", (req)=> { if(isListing(req.url())) lists.push(req.url()); });
      await markAll(page).click();
      await expect(panel(page).locator("li")).toHaveCount(0);
      expect(lists).toEqual([]);
      await expect(panel(page)).toContainText("No new notifications");
      await expect(page.locator("#nav-notifications .nav-badge")).toBeHidden();
      await expect(panel(page), "it's still there, for what's next").toBeVisible();
      const unread = await context.request.get("/notifications?status=unread");
      expect(await unread.json()).toEqual([]);
    });

    test("corrects the count, if something was read in another tab", async ({page, baseURL, context})=>{
      await withNotification(page, baseURL!);
      const badge = page.locator("#nav-notifications .nav-badge");
      const [{notification_id}] = await (await context.request.get("/notifications?status=unread")).json();
      await context.request.post("/notifications/read", {data: JSON.stringify({ids: [notification_id]}), headers: {"Content-Type": "application/json"}});
      await expect(badge, "tabs don't tell each other").toHaveAttribute("data-count", "1");
      await openList(page);
      await expect(badge).toBeHidden();
      await expect(panel(page)).toContainText("No new notifications");
    });

    test("a right click on a title doesn't mark it as read", async ({page, baseURL, context})=>{
      await withNotification(page, baseURL!);
      await openList(page);
      await panel(page).locator("li a").click({button: "right"});
      await page.waitForTimeout(200);
      const unread = await (await context.request.get("/notifications?status=unread")).json();
      expect(unread).toHaveLength(1);
    });

    test("following a title marks it as read", async ({page, baseURL, context})=>{
      await withNotification(page, baseURL!);
      await openList(page);
      await panel(page).locator("li a").click();
      await page.waitForURL(/\/ui\/tasks\/\d+$/);
      await expect.poll(async ()=> await (await context.request.get("/notifications?status=unread")).json()).toEqual([]);
    });

    test("doesn't take markup from a scene's name", async ({page, baseURL})=>{
      await open(page, PAGE);
      const started = page.evaluate(()=> new Promise<void>((resolve)=>{
        document.addEventListener("task-event", ()=> resolve(), {once: true});
      }));
      const cookie = (await page.context().cookies()).map(c=> `${c.name}=${c.value}`).join("; ");
      const req = http.request(new URL(`/scenes/${encodeURIComponent(`<b id="injected">${randomUUID()}</b>`)}`, baseURL!), {
        method: "POST",
        headers: {Cookie: cookie, "Content-Type": "application/octet-stream", "Content-Length": "1000000"},
      });
      req.on("error", ()=>{});
      req.write("incomplete");
      await started;
      req.destroy();
      await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
      await openList(page);
      await expect(panel(page).locator("li")).toContainText("<b id=");
      await expect(page.locator("#injected")).toHaveCount(0);
    });

    test("can be used from the keyboard", async ({page, baseURL})=>{
      await withNotification(page, baseURL!);
      const lists: string[] = [];
      page.on("request", (req)=> { if(isListing(req.url())) lists.push(req.url()); });
      const listed = page.waitForResponse(res=> isListing(res.url()));
      await bell(page).focus();
      await page.keyboard.press("Enter");
      await listed;
      await expect(panel(page)).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(panel(page).locator("li a")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(panel(page).locator("li button")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(panel(page).getByRole("link", {name: "all notifications"})).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(markAll(page)).toBeFocused();
      //Listing again would replace what has the focus
      await page.waitForTimeout(100);
      expect(lists).toHaveLength(1);
    });

    test("marks one as read without leaving the page, and stays usable from the keyboard", async ({page, baseURL, context})=>{
      const first = await withNotification(page, baseURL!);
      const badge = page.locator("#nav-notifications .nav-badge");
      const second = await abandonUpload(page, baseURL!);
      await expect(badge).toHaveAttribute("data-count", "2");
      await openList(page);

      const mark = panel(page).locator("li").filter({hasText: second}).getByRole("button", {name: "mark as read"});
      await expect(mark).toHaveAttribute("title", "mark as read");
      await expect(mark.locator("ui-icon")).toHaveAttribute("name", "check-check");
      await mark.focus();
      await mark.press("Enter");

      await expect(badge).toHaveAttribute("data-count", "1");
      await expect(panel(page).locator("li")).toHaveCount(1);
      await expect(panel(page).locator("li")).toContainText(first);
      await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
      await expect(markAll(page), "its button is gone: the focus has to go somewhere").toBeFocused();
      const unread = await (await context.request.get("/notifications?status=unread")).json();
      expect(unread.map((n: any)=> n.message)).toEqual([expect.stringContaining(first)]);

      await panel(page).locator("li button").focus();
      await panel(page).locator("li button").press("Enter");
      await expect(badge).toBeHidden();
      await expect(bell(page), "nothing's left in the list").toBeFocused();
    });

    test("keeps the inbox page in sync", async ({page, baseURL})=>{
      await withNotification(page, baseURL!);
      await open(page, "/ui/user/notifications");
      await expect(page.locator(".inbox-item.unread")).toHaveCount(1);
      await openList(page);
      await markAll(page).click();
      await expect(page.locator(".inbox-item.unread")).toHaveCount(0);
      await expect(page.locator("#inbox-mark-all")).toHaveCount(0);
      await expect(page.locator(".inbox-item").getByRole("button", {name: "Delete"})).toBeVisible();
    });

    test.describe("on a touch screen", ()=>{
      test.use({ hasTouch: true, viewport: {width: 390, height: 700} });

      test("goes to the page of notifications, with no list in between", async ({page, baseURL})=>{
        await withNotification(page, baseURL!);
        let listed = false;
        page.on("request", req=>{ if(isListing(req.url())) listed = true; });
        await page.locator("#main-navbar-collapse-toggle").tap();
        await expect(bell(page)).toBeVisible();
        await bell(page).tap();
        await page.waitForURL(/\/ui\/user\/notifications$/);
        await expect(page.locator(".inbox-item.unread")).toHaveCount(1);
        await expect(panel(page)).toBeHidden();
        expect(listed).toBe(false);
      });
    });

    test("goes by the size the window has now, even with a list that's been opened before", async ({page})=>{
      await open(page, PAGE);
      await listOf(page, 2);
      await openList(page);
      await bell(page).click();
      await expect(panel(page)).toBeHidden();
      await page.setViewportSize({width: 390, height: 700});
      await page.locator("#main-navbar-collapse-toggle").click();
      await bell(page).click();
      await page.waitForURL(/\/ui\/user\/notifications$/);
    });

    test.describe("how long ago", ()=>{
      const time = (page: Page)=> panel(page).locator("li time");
      const ago = (ms: number)=> new Date(Date.now() - ms).toISOString();
      const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

      /** One notification, of a given age */
      async function aged(page: Page, ctime: string){
        await page.route(url=> isListing(url.toString()), (route)=> route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{notification_id: 1, type: "task", ctime, read_at: null, message: "Notification", link: "/ui/tasks/1", task: {task_id: 1, type: "testTask", status: "success"}, scene: null}]),
        }));
        await openList(page);
      }

      test("works from what the API really gives", async ({page, baseURL})=>{
        await withNotification(page, baseURL!);
        await openList(page);
        await expect(time(page)).toHaveText(/^(now|\d+ ?m(in)?\.? ago)$/);
        const datetime = await time(page).getAttribute("datetime");
        expect(Math.abs(Date.now() - new Date(datetime!).getTime())).toBeLessThan(5 * MINUTE);
      });

      for(const [age, expected] of [
        [30_000, "now"],
        [5 * MINUTE + 1000, "5 min. ago"],
        [3 * HOUR + 1000, "3 hr. ago"],
        [DAY + 1000, "yesterday"],
        [2 * DAY + 1000, "2 days ago"],
        [800 * DAY, "2 yr. ago"],
      ] as const){
        test(`says "${expected}"`, async ({page})=>{
          await open(page, PAGE);
          await aged(page, ago(age));
          await expect(time(page)).toHaveText(expected);
        });
      }

      test("doesn't tell a time to come, if clocks don't agree", async ({page})=>{
        await open(page, PAGE);
        await aged(page, ago(-5 * MINUTE));
        await expect(time(page)).toHaveText("now");
      });

      test("is in the language of the page", async ({page})=>{
        await open(page, `${PAGE}?lang=fr`);
        await aged(page, ago(5 * MINUTE + 1000));
        await expect(time(page)).toHaveText("il y a 5 min");
      });

      test("is muted, after the title, without taking anything from it", async ({page})=>{
        await open(page, PAGE);
        await listOf(page, 1, ()=> "A very long title ".repeat(10));
        await openList(page);
        const title = panel(page).locator("li a > span");
        await expect(time(page)).toHaveCSS("opacity", "0.75");
        const [titleBox, timeBox, button] = [await title.boundingBox(), await time(page).boundingBox(), await panel(page).locator("li button").boundingBox()];
        expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(timeBox!.x);
        expect(timeBox!.x + timeBox!.width).toBeLessThanOrEqual(button!.x);
        expect(await time(page).evaluate(el=> el.scrollWidth <= el.clientWidth), "it's not cut").toBe(true);
      });

      test("is skipped without the Temporal API", async ({page})=>{
        await page.addInitScript(()=>{ delete (globalThis as any).Temporal; });
        await open(page, PAGE);
        await listOf(page, 2);
        await openList(page);
        await expect(panel(page).locator("li")).toHaveCount(2);
        await expect(time(page)).toHaveCount(0);
      });
    });
  });

  test("marking uses a shared icon, and keeps a name for those who can't see it", async ({page, baseURL})=>{
    await open(page, PAGE);
    await abandonUpload(page, baseURL!);
    await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
    await open(page, "/ui/user/notifications");
    const row = page.locator(".inbox-item.unread").getByRole("button", {name: "mark as read"});
    await expect(row.locator("ui-icon")).toHaveAttribute("name", "check-check");
    await expect(row).toHaveAttribute("title", "mark as read");
    await expect(row).toHaveText("");
    await expect(row).toHaveClass(/btn-outline/);
    const all = page.locator("#inbox-mark-all");
    await expect(all.locator("ui-icon")).toHaveAttribute("name", "check-check");
    await expect(all).toHaveText("mark all as read");
  });

  test.describe("deleting from the page of notifications", ()=>{
    const items = (page: Page)=> page.locator(".inbox-item");
    const mark = (page: Page)=> page.getByRole("button", {name: "mark as read"});
    const remove = (page: Page)=> page.getByRole("button", {name: "Delete"});
    const badge = (page: Page)=> page.locator("#nav-notifications .nav-badge");

    /** Lands on the page with that many notifications, none of them read */
    async function withUnread(page: Page, baseURL: string, count: number){
      await open(page, PAGE);
      for(let i = 1; i <= count; i++){
        await abandonUpload(page, baseURL);
        await expect(badge(page)).toHaveAttribute("data-count", i.toString());
      }
      await open(page, "/ui/user/notifications");
    }

    /** Lands on the page with all of its notifications read */
    async function withRead(page: Page, baseURL: string, count: number){
      await withUnread(page, baseURL, count);
      await page.locator("#inbox-mark-all").click();
      await expect(remove(page)).toHaveCount(count);
    }

    test("isn't offered until it's been read, and then takes the place of marking it", async ({page, baseURL})=>{
      await withUnread(page, baseURL!, 1);
      await expect(remove(page)).toHaveCount(0);
      const before = await mark(page).boundingBox();
      await mark(page).click();
      await expect(remove(page)).toBeVisible();
      await expect(mark(page)).toHaveCount(0);
      expect(await remove(page).boundingBox()).toEqual(before);
      await expect(remove(page).locator("ui-icon")).toHaveAttribute("name", "trash");
      await expect(remove(page)).toHaveAttribute("title", "Delete");
    });

    test("removes it for good, and leaves the others alone", async ({page, baseURL})=>{
      await withUnread(page, baseURL!, 2);
      const [newest, oldest] = await items(page).evaluateAll(els=> els.map(el=> (el as HTMLElement).dataset.notificationId));
      await items(page).first().locator(".inbox-mark-read").click();
      await expect(remove(page)).toHaveCount(1);
      const link = await page.locator(`[data-notification-id="${newest}"] a.inbox-item-message`).getAttribute("href");
      await remove(page).click();
      await expect(items(page)).toHaveCount(1);
      await expect(page.locator(`[data-notification-id="${oldest}"]`)).toHaveClass(/unread/);
      await expect(badge(page), "it didn't count anymore").toHaveAttribute("data-count", "1");
      await open(page, "/ui/user/notifications");
      await expect(items(page)).toHaveCount(1);
      await expect(page.locator(`[data-notification-id="${newest}"]`)).toHaveCount(0);
      await page.goto(link!);
      await expect(page.locator("h1, h2, h3").first(), "the task is still there").toBeVisible();
      expect((await page.request.get(link!)).status()).toEqual(200);
    });

    test("doesn't take the end of a double click for it, when marking as read", async ({page, baseURL})=>{
      await withUnread(page, baseURL!, 1);
      const box = await mark(page).boundingBox();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down({clickCount: 1});
      await page.mouse.up({clickCount: 1});
      await expect(remove(page)).toBeVisible();
      await page.mouse.down({clickCount: 2});
      await page.mouse.up({clickCount: 2});
      await page.waitForTimeout(200);
      await expect(items(page)).toHaveCount(1);
    });

    test("only deletes one with a double click", async ({page, baseURL})=>{
      await withRead(page, baseURL!, 2);
      await remove(page).first().dblclick();
      await expect(items(page)).toHaveCount(1);
      await page.waitForTimeout(200);
      await open(page, "/ui/user/notifications");
      await expect(items(page)).toHaveCount(1);
    });

    test("says when nothing's left", async ({page, baseURL})=>{
      await withRead(page, baseURL!, 1);
      await remove(page).click();
      await expect(page.getByText("No notifications.")).toBeVisible();
      await expect(items(page)).toHaveCount(0);
    });

    test("can be reached from the keyboard, right after marking as read", async ({page, baseURL})=>{
      await withUnread(page, baseURL!, 2);
      await items(page).first().locator(".inbox-mark-read").focus();
      await page.keyboard.press("Enter");
      await expect(remove(page)).toHaveCount(1);
      await expect(items(page), "it's still there").toHaveCount(2);
      await page.keyboard.press("Tab");
      await expect(remove(page)).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(items(page)).toHaveCount(1);
    });

    test("tells when it fails, and it can be tried again", async ({page, baseURL})=>{
      await withRead(page, baseURL!, 1);
      await page.route(/\/notifications\/\d+$/, (route)=> route.fulfill({status: 500, contentType: "application/json", body: "{}"}));
      await remove(page).click();
      await expect(page.locator(".notification.error, .notification").first()).toContainText("Couldn't delete this notification");
      await expect(items(page)).toHaveCount(1);
      await expect(remove(page)).toBeEnabled();
      await page.unroute(/\/notifications\/\d+$/);
      await remove(page).click();
      await expect(page.getByText("No notifications.")).toBeVisible();
    });

    test("isn't a failure if it's already gone", async ({page, baseURL})=>{
      await withRead(page, baseURL!, 2);
      const id = await items(page).first().getAttribute("data-notification-id");
      await expect(await page.request.delete(`/notifications/${id}`)).toBeOK();
      await remove(page).first().click();
      await expect(items(page)).toHaveCount(1);
      await expect(page.locator(".notification")).toHaveCount(0);
    });
  });

  test.describe("tasks", ()=>{
    test("visiting a task marks its notification as read", async ({page, baseURL, context})=>{
      await open(page, PAGE);
      await abandonUpload(page, baseURL!);
      const badge = page.locator("#nav-notifications .nav-badge");
      await expect(badge).toHaveAttribute("data-count", "1");
      const [{link}] = await (await context.request.get("/notifications?status=unread")).json();

      //However we get there
      const connected = page.waitForResponse(res=> STREAM.test(res.url()));
      await page.goto(link);
      await connected;
      await expect(badge, "on that same page").toBeHidden();
      expect(await (await context.request.get("/notifications?status=unread")).json()).toEqual([]);
    });

    test.describe("in their list", ()=>{
      const badge = (page: Page)=> page.locator("#nav-notifications .nav-badge");

      test.describe("as a hierarchy", ()=>{
        /** A real scene, whose creation runs a task with others under it */
        async function createScene(page: Page, context: BrowserContext){
          const res = await context.request.post(`/scenes/${randomUUID()}`, {
            data: await fs.readFile(path.join(import.meta.dirname, "../__test_fixtures/cube.glb")),
            headers: {"Content-Type": "model/gltf-binary"},
          });
          await expect(res).toBeOK();
        }
        const tree = (page: Page)=> page.locator(".task-rows-tree details").first();

        test("nests what's under a task, and can collapse it", async ({page, context})=>{
          await createScene(page, context);
          await page.goto("/ui/user/tasks?rootOnly=false");
          await expect(tree(page), "open from the start").toHaveAttribute("open", "");
          const parent = tree(page).locator("summary .task-row");
          const child = tree(page).locator("ul .task-row").first();
          await expect(child).toBeVisible();
          const [parentBox, childBox] = [await parent.boundingBox(), await child.boundingBox()];
          expect(childBox!.x, "further to the right").toBeGreaterThan(parentBox!.x);

          await tree(page).locator("summary").click({position: {x: 4, y: 10}});
          await expect(child).toBeHidden();
          await expect(parent).toBeVisible();

          await tree(page).locator("summary").click({position: {x: 4, y: 10}});
          await expect(child).toBeVisible();
        });

        test("following a link doesn't collapse anything", async ({page, context})=>{
          await createScene(page, context);
          await page.goto("/ui/user/tasks?rootOnly=false");
          await tree(page).locator("summary .task-row-type").click();
          await page.waitForURL(/\/ui\/tasks\/\d+$/);
        });

        test("keeps the type of a task in sight, whatever the length of its scene's name", async ({page, context})=>{
          await page.setViewportSize({width: 390, height: 700});
          const name = `a very long name ${"that goes on and on ".repeat(10)}${randomUUID()}`;
          const res = await context.request.post(`/scenes/${encodeURIComponent(name)}`, {
            data: await fs.readFile(path.join(import.meta.dirname, "../__test_fixtures/cube.glb")),
            headers: {"Content-Type": "model/gltf-binary"},
          });
          await expect(res).toBeOK();
          await page.goto("/ui/user/tasks");
          const [row, type, status] = [
            await page.locator(".task-row-content").first().boundingBox(),
            await page.locator(".task-row-type").first().boundingBox(),
            await page.locator(".task-row .task-status").first().boundingBox(),
          ];
          expect(type!.x + type!.width, "next to the name, before the status").toBeLessThanOrEqual(status!.x);
          expect(type!.x + type!.width).toBeLessThanOrEqual(row!.x + row!.width + 1);
          await expect(page.locator(".task-row-type").first()).toHaveText("postScene");
          await expect(page.locator(".task-row-scene").first(), "with what closes it").toContainText("›");
          const scene = await page.locator(".task-row-scene").first().boundingBox();
          expect(scene!.x + scene!.width, "the name gives way").toBeLessThanOrEqual(status!.x);
          const overflow = await page.evaluate(()=> document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, "no scrolling sideways").toBeLessThanOrEqual(0);
        });

        test("doesn't cut the type for a long name on a wide screen", async ({page, context})=>{
          await page.setViewportSize({width: 1200, height: 700});
          const name = `a very long name ${"that goes on and on ".repeat(10)}${randomUUID()}`;
          await expect(await context.request.post(`/scenes/${encodeURIComponent(name)}`, {
            data: await fs.readFile(path.join(import.meta.dirname, "../__test_fixtures/cube.glb")),
            headers: {"Content-Type": "model/gltf-binary"},
          })).toBeOK();
          await page.goto("/ui/user/tasks");
          const type = page.locator(".task-row-type").first();
          const {scrollWidth, clientWidth} = await type.evaluate(el=> ({scrollWidth: el.scrollWidth, clientWidth: el.clientWidth}));
          expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
          const [typeBox, sceneBox] = [await type.boundingBox(), await page.locator(".task-row-scene").first().boundingBox()];
          expect(sceneBox!.y, "on the same line").toBeLessThan(typeBox!.y + typeBox!.height);
          const link = page.locator(".task-row-scene a").first();
          const cut = await link.evaluate(el=> el.scrollWidth - el.clientWidth);
          expect(cut, "the name is what gives way").toBeGreaterThan(0);
        });

        test("keeps a short name on the line of its type, even on a small screen", async ({page, context})=>{
          await expect(await context.request.post(`/scenes/${randomBytes(2).toString("hex")}`, {
            data: await fs.readFile(path.join(import.meta.dirname, "../__test_fixtures/cube.glb")),
            headers: {"Content-Type": "model/gltf-binary"},
          })).toBeOK();
          await page.setViewportSize({width: 520, height: 700});
          await page.goto("/ui/user/tasks");
          const [typeBox, sceneBox] = [await page.locator(".task-row-type").first().boundingBox(), await page.locator(".task-row-scene").first().boundingBox()];
          expect(sceneBox!.y).toBeLessThan(typeBox!.y + typeBox!.height);
        });

        test("keeps everything in its row on a phone", async ({page, context})=>{
          await page.setViewportSize({width: 390, height: 900});
          await createScene(page, context);
          await page.goto("/ui/user/tasks?rootOnly=false");
          const rows = page.locator(".task-row");
          expect(await rows.count(), "with some long types among them").toBeGreaterThan(2);
          await expect(page.locator(".task-row-type", {hasText: "createDocumentFromFiles"})).toHaveCount(1);
          for(const row of await rows.all()){
            const status = await row.locator(".task-status").boundingBox();
            //Text can get out of a box that's been shrunk, so it has to be held back too
            for(const part of await row.locator(".task-row-type, .task-row-scene").all()){
              const box = await part.boundingBox();
              expect(box!.x + box!.width, await part.innerText()).toBeLessThanOrEqual(status!.x);
              await expect(part).toHaveCSS("overflow-x", "hidden");
            }
          }
          //The scene is still readable there
          const scene = page.locator(".task-row-scene").first();
          const [type, name] = [await page.locator(".task-row-type").first().boundingBox(), await scene.boundingBox()];
          expect(name!.y, "on a line of its own").toBeGreaterThanOrEqual(type!.y + type!.height - 1);
          expect(name!.width, "with some room").toBeGreaterThan(type!.width);
        });

        test("root tasks have nothing to unfold", async ({page, context})=>{
          await createScene(page, context);
          await page.goto("/ui/user/tasks");
          await expect(page.locator(".task-row").first()).toBeVisible();
          await expect(page.locator(".task-rows details")).toHaveCount(0);
        });
      });

      for(const {name, viewport} of [{name: "a wide screen", viewport: {width: 1200, height: 700}}, {name: "a phone", viewport: {width: 390, height: 700}}]){
        test(`fits on ${name}, whatever the length of names`, async ({page, baseURL})=>{
          await page.setViewportSize({width: 1200, height: 700});
          await open(page, PAGE);
          await abandonUpload(page, baseURL!);
          await expect(badge(page)).toHaveAttribute("data-count", "1");
          await page.setViewportSize(viewport);
          await page.goto("/ui/user/tasks");
          const row = await page.locator(".task-row").first().boundingBox();
          const status = await page.locator(".task-row .task-status").first().boundingBox();
          expect(status!.x + status!.width, "the status is within the row").toBeLessThanOrEqual(row!.x + row!.width);
          const overflow = await page.evaluate(()=> document.documentElement.scrollWidth - document.documentElement.clientWidth);
          expect(overflow, "no scrolling sideways").toBeLessThanOrEqual(0);
        });
      }
    });
  });


  test.describe("toast", ()=>{
    test.beforeEach(async ({page})=>{
      await page.clock.install();
    });

    test("goes away by itself even for an error, and can be found again", async ({page, baseURL})=>{
      await open(page, PAGE);
      await page.clock.fastForward(2000);
      const scene = await abandonUpload(page, baseURL!);
      const toast = page.locator(".notification-error");
      await expect(toast).toContainText(scene);
      await page.clock.fastForward(9000);
      await page.waitForTimeout(100);
      await expect(toast, "still in time to read it").toBeVisible();
      await expect(toast, "not on its way out either").not.toHaveClass(/fade/);
      await expect(async ()=>{
        await page.clock.fastForward(1000);
        await expect(toast).toHaveCount(0, {timeout: 100});
      }).toPass();

      await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
      await page.locator("#nav-notifications").click();
      await expect(page.locator("#nav-notifications-panel li")).toContainText(scene);
    });
  });

  test.describe("badge color", ()=>{
    const badge = (page: Page)=> page.locator("#nav-notifications .nav-badge");
    const colorOf = (page: Page, name: string)=> page.evaluate((name)=>{
      const probe = document.createElement("div");
      probe.style.color = `var(${name})`;
      document.body.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    }, name);

    test("is for success if there's no failure in what's unread", async ({page})=>{
      await page.route(STREAM, (route)=> route.fulfill({status: 200, contentType: "text/event-stream", body: `retry: 100000\n\n${snapshot(3)}`}));
      await page.goto(PAGE);
      await expect(badge(page)).toHaveAttribute("data-count", "3");
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-success"));
    });

    test("is for danger if there's any failure in what's unread", async ({page})=>{
      await page.route(STREAM, (route)=> route.fulfill({status: 200, contentType: "text/event-stream", body: `retry: 100000\n\n${snapshot(3, 1)}`}));
      await page.goto(PAGE);
      await expect(badge(page)).toHaveAttribute("data-count", "3");
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-error"));
      //Whatever state the bell is in
      await page.route(url=> url.toString().includes("status=unread&limit="), (route)=> route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([3, 2, 1].map(id=> ({notification_id: id, ctime: new Date().toISOString(), message: `Task ${id}`, link: `/ui/tasks/${id}`, task: {task_id: id, status: id === 2 ? "error" : "success"}}))),
      }));
      await page.locator("#nav-notifications").hover();
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-error"));
      await page.locator("#nav-notifications").click();
      await expect(page.locator("#nav-notifications-panel li")).toHaveCount(3);
      await expect(badge(page)).toHaveAttribute("data-count", "3");
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-error"));
    });

    test("changes as soon as a failure comes in", async ({page, baseURL})=>{
      await open(page, PAGE);
      await abandonUpload(page, baseURL!);
      await expect(badge(page)).toHaveAttribute("data-count", "1");
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-error"));
    });

    test("changes in a hidden tab too", async ({page, baseURL})=>{
      await open(page, PAGE);
      const {leave} = await startUpload(page, baseURL!);
      await setHidden(page, true);
      leave();
      await expect(badge(page)).toHaveAttribute("data-count", "1");
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-error"));
    });

    test("comes back to success once the failures are read", async ({page})=>{
      await page.route(STREAM, (route)=> route.fulfill({status: 200, contentType: "text/event-stream", body: `retry: 100000\n\n${snapshot(2, 1)}`}));
      await page.route("**/notifications/read", (route)=> route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({read: 1, unread: 1, unread_errors: 0})}));
      await page.route(url=> url.toString().includes("status=unread&limit="), (route)=> route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {notification_id: 2, ctime: new Date().toISOString(), message: "Failure", link: "/ui/tasks/2", task: {task_id: 2, status: "error"}},
          {notification_id: 1, ctime: new Date().toISOString(), message: "Success", link: "/ui/tasks/1", task: {task_id: 1, status: "success"}},
        ]),
      }));
      await page.goto(PAGE);
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-error"));
      await page.locator("#nav-notifications").click();
      await page.locator("#nav-notifications-panel li").first().getByRole("button").click();
      await expect(badge(page)).toHaveAttribute("data-count", "1");
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-success"));
    });

    test("is corrected by the list, if another tab read the failures", async ({page})=>{
      await page.route(STREAM, (route)=> route.fulfill({status: 200, contentType: "text/event-stream", body: `retry: 100000\n\n${snapshot(2, 1)}`}));
      await page.route(url=> url.toString().includes("status=unread&limit="), (route)=> route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{notification_id: 1, ctime: new Date().toISOString(), message: "Success", link: "/ui/tasks/1", task: {task_id: 1, status: "success"}}]),
      }));
      await page.goto(PAGE);
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-error"));
      await page.locator("#nav-notifications").click();
      await expect(badge(page)).toHaveAttribute("data-count", "1");
      await expect(badge(page)).toHaveCSS("background-color", await colorOf(page, "--color-success"));
    });
  });

  test("a hidden tab only updates its badge", async ({page, baseURL})=>{
    await open(page, PAGE);
    const {leave} = await startUpload(page, baseURL!);
    await setHidden(page, true);
    leave();
    await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
    await page.waitForTimeout(300);
    await expect(page.locator(".notification")).toHaveCount(0);
  });

  test("a notification doesn't follow a task that was awaited", async ({page, context})=>{
    await open(page, PAGE);
    const res = await page.evaluate(async ()=>{
      const r = await fetch(`/scenes/${crypto.randomUUID()}`, {method: "POST", headers: {"Content-Type": "application/octet-stream"}, body: "not a model"});
      return r.status;
    });
    expect(res).toBeGreaterThanOrEqual(400);
    const inbox = await context.request.get("/notifications?status=all");
    await expect(inbox).toBeOK();
    expect(await inbox.json()).toEqual([]);
    await expect(page.locator(".notification")).toHaveCount(0);
  });


  test.describe("connection", ()=>{
    test.beforeEach(async ({page})=>{
      await page.clock.install();
    });

    /**
     * Time is only faked in the page, so pings from the server don't keep up with it.
     * This keeps it from taking that for a connection that's gone silent.
     */
    async function ignoreSilence(page: Page){
      await page.addInitScript(()=>{
        const {setTimeout} = window;
        window.setTimeout = ((fn: any, delay: any, ...args: any[])=> delay === 75000 ? 0 : setTimeout(fn, delay, ...args)) as any;
      });
    }

    function failedStreams(page: Page){
      const requests: Request[] = [];
      page.on("requestfailed", (req)=>{
        if(STREAM.test(req.url())) requests.push(req);
      });
      return requests;
    }

    /**
     * How long the page takes to make its next request, according to its clock.
     *
     * Moves the clock in steps: seeing a request doesn't mean that its page has handled the response. It may only
     * start waiting after that, so moving the clock in one go could jump over a delay that hasn't started yet.
     * That can only make the result longer than the delay, by about a step.
     */
    async function timeUntilRequest(page: Page, requests: Request[], step: number, limit: number){
      const count = requests.length;
      for(let waited = step; waited <= limit; waited += step){
        await page.clock.fastForward(step);
        await page.waitForTimeout(20);
        if(count < requests.length) return waited;
      }
      throw new Error(`No new request after ${limit}ms`);
    }

    /** Lets the page load, and its opening delay expire */
    async function load(page: Page){
      await page.goto(PAGE, {waitUntil: "load"});
      await page.clock.fastForward(2000);
    }

    test("doesn't open for a quick look at a page", async ({page})=>{
      const requests = streamRequests(page);
      await page.goto(PAGE, {waitUntil: "load"});
      await page.clock.fastForward(1000);
      await page.goto("/ui/user/");
      await page.clock.fastForward(1000);
      await expectRequests(page, requests, 0);
    });

    test("doesn't open in a tab that opened in the background", async ({page})=>{
      const requests = streamRequests(page);
      await page.addInitScript(()=> Object.defineProperty(document, "hidden", {value: true, configurable: true}));
      await load(page);
      await expectRequests(page, requests, 0);

      await setHidden(page, false);
      await expect.poll(()=> requests.length).toBe(1);
    });

    test("closes in a tab that stays hidden, and opens again when it's back", async ({page})=>{
      await ignoreSilence(page);
      const requests = streamRequests(page);
      const closed = page.waitForEvent("requestfailed", req=> STREAM.test(req.url()));
      await load(page);
      await expect.poll(()=> requests.length).toBe(1);
      await page.waitForResponse(res=> STREAM.test(res.url()));

      await setHidden(page, true);
      await page.clock.fastForward(60 * 1000);
      await setHidden(page, false);
      await page.clock.fastForward(5 * 60 * 1000);
      await expectRequests(page, requests, 1, "was only away for a moment");

      await setHidden(page, true);
      await page.clock.fastForward(121 * 1000);
      await closed;

      await setHidden(page, false);
      await expect.poll(()=> requests.length).toBe(2);
    });

    test("stays open in a hidden tab while a task is running", async ({page, baseURL})=>{
      await ignoreSilence(page);
      const requests = streamRequests(page);
      const failures = failedStreams(page);
      await load(page);
      await page.waitForResponse(res=> STREAM.test(res.url()));
      const {leave} = await startUpload(page, baseURL!);
      try{
        await setHidden(page, true);
        await page.clock.fastForward(121 * 1000);
        await expectRequests(page, requests, 1);
        expect(failures).toHaveLength(0);
      }finally{
        leave();
      }
      //Once it's over, it has no reason to stay
      await expect(page.locator("#nav-notifications .nav-badge")).toHaveAttribute("data-count", "1");
      await page.clock.fastForward(121 * 1000);
      await expect.poll(()=> failures.length).toBe(1);
    });

    test("lets go of the connection when leaving a page, and connects again if it's restored", async ({page})=>{
      //Those can't be tested for real: automated browsers don't use the back/forward cache
      await ignoreSilence(page);
      const requests = streamRequests(page);
      const failures = failedStreams(page);
      await load(page);
      await page.waitForResponse(res=> STREAM.test(res.url()));

      await page.evaluate(()=> window.dispatchEvent(new PageTransitionEvent("pagehide", {persisted: true})));
      await expect.poll(()=> failures.length, "with a stream open, the page wouldn't be eligible").toBe(1);
      //It's a deliberate end: nothing should bring it back
      await page.clock.fastForward(5 * 60 * 1000);
      await expectRequests(page, requests, 1);

      await page.evaluate(()=> window.dispatchEvent(new PageTransitionEvent("pageshow", {persisted: true})));
      await page.clock.fastForward(2000);
      await expect.poll(()=> requests.length).toBe(2);
    });

    test("uses the count from the snapshot, and connects again when a stream ends", async ({page})=>{
      const requests = streamRequests(page);
      let unread = 3;
      await page.route(STREAM, (route)=> route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `retry: 2000\n\n${snapshot(unread)}`,
      }));
      await load(page);
      const badge = page.locator("#nav-notifications .nav-badge");
      await expect(badge).toHaveAttribute("data-count", "3");

      //The page gets to know that the stream has ended at some point after showing the count
      const afterRetry = async (check: ()=>Promise<void>)=> await expect(async ()=>{
        await page.clock.fastForward(2100);
        await check();
      }).toPass();

      const shown = ()=> badge.evaluate(el=> getComputedStyle(el, "::before").content);
      for(const [count, display] of [[1, "1"], [9, "9"], [10, "★"], [99, "★"], [120, "★"]] as const){
        unread = count;
        await afterRetry(()=> expect(badge).toHaveAttribute("data-count", count.toString(), {timeout: 100}));
        expect(await shown()).toEqual(`"${display}"`);
        await expect(badge, "the actual count, for those who can't see it").toHaveAttribute("aria-label", count.toString());
      }

      unread = 0;
      await afterRetry(()=> expect(badge).toBeHidden({timeout: 100}));
      expect(requests.length).toBeGreaterThanOrEqual(3);
    });

    for(const status of [401, 403, 404]){
      test(`gives up on a ${status}`, async ({page})=>{
        //Otherwise, moving the clock before the page got its answer would count as it taking too long
        await ignoreSilence(page);
        const requests = streamRequests(page);
        await page.route(STREAM, (route)=> route.fulfill({status, body: "nope"}));
        await load(page);
        await expect.poll(()=> requests.length).toBe(1);
        await page.clock.fastForward(10 * 60 * 1000);
        await setHidden(page, true);
        await setHidden(page, false);
        await page.clock.fastForward(10 * 60 * 1000);
        await expectRequests(page, requests, 1);
      });
    }

    for(const status of [429, 503]){
      test(`waits for as long as it's asked to on a ${status}`, async ({page})=>{
        const requests = streamRequests(page);
        await page.route(STREAM, (route)=> route.fulfill({status, headers: {"Retry-After": "30"}, body: "busy"}));
        await load(page);
        await expect.poll(()=> requests.length).toBe(1);
        //That's 30 seconds, plus up to half of that for jitter
        const waited = await timeUntilRequest(page, requests, 1000, 60 * 1000);
        expect(waited).toBeGreaterThanOrEqual(30 * 1000);
        expect(waited).toBeLessThanOrEqual(48 * 1000);
      });
    }

    test("backs off on anything that isn't a stream", async ({page})=>{
      const requests = streamRequests(page);
      await page.route(STREAM, (route)=> route.fulfill({status: 200, contentType: "text/html", body: "<p>A proxy's error page</p>"}));
      await load(page);
      await expect.poll(()=> requests.length).toBe(1);
      //At first, that's what the server would ask for: 5 seconds with jitter
      expect(await timeUntilRequest(page, requests, 500, 30 * 1000)).toBeGreaterThanOrEqual(2500);
      //Then 2 seconds with jitter, and it keeps growing
      expect(await timeUntilRequest(page, requests, 500, 30 * 1000)).toBeGreaterThanOrEqual(1000);
      expect(await timeUntilRequest(page, requests, 500, 30 * 1000)).toBeGreaterThanOrEqual(2000);
    });

    test("connects again when the connection goes silent", async ({page})=>{
      const requests = streamRequests(page);
      //Never answers
      await page.route(STREAM, ()=>{});
      await load(page);
      await expect.poll(()=> requests.length).toBe(1);
      await page.clock.fastForward(74 * 1000);
      await expectRequests(page, requests, 1);
      //What's left of the 75 seconds, then at most 1.5×5 s before trying again
      expect(await timeUntilRequest(page, requests, 500, 15 * 1000)).toBeLessThanOrEqual(10 * 1000);
    });
  });
});
