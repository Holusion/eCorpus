/**
 * Lists of notifications that the server draws: the page of a user's notifications (/ui/user/notifications),
 * read or not, a page at a time, and what the upload page has started.
 * What the stream tells about them shows there too: a line whose state changes is drawn again by the server,
 * which knows what came out of it (see notifications/outcomes.ts). One request at a time: the last one has the last word.
 * With only those that are unread, what gets read leaves it, as it leaves the bell's panel.
 *
 * The page of notifications doesn't add what's come since: the bell has that.
 * A list can follow notifications of some types, with `data-follow` (the upload page's): then what's new of those types is added.
 * That list is out of sight while it's empty: it's there for what comes.
 *
 * In the activity bundle, as it shares what the stream has told with the bell: bundles don't share modules.
 */
import { NotificationItem, ItemState, stateOf } from "../state/notifications";
import { getItem, listItems } from "./state";
import { followsLink, markAsRead } from "./markRead";
import { markButton, messageOf, statusIcon } from "./panel";
import { LEAVE_DURATION, wipeAway } from "./leave";

const list = document.querySelector<HTMLElement>("[data-notifications]");
const section = list?.closest<HTMLElement>(".notifications-page");
const markAll = section?.querySelector<HTMLButtonElement>(".notifications-mark-all");
const unreadOnly = list?.hasAttribute("data-unread-only") ?? false;
const follows = list?.dataset.follow?.split(/\s+/).filter(Boolean) ?? [];

function lines() {
  return list!.querySelectorAll<HTMLElement>(":scope > li[data-notification-id]");
}

function idOf(li: HTMLElement) {
  return parseInt(li.dataset.notificationId!, 10);
}

function lineOf(id: number) {
  return list!.querySelector<HTMLElement>(`:scope > li[data-notification-id="${id}"]`);
}

/** In its place, with focus where it was in it: on the same kind of control if it has one */
function replace(old: HTMLElement, line: HTMLElement) {
  const focused = document.activeElement as HTMLElement | null;
  const had = !!focused && old.contains(focused);
  const onButton = had && !!focused!.closest(".notifications-mark-read");
  old.replaceWith(line);
  if (had) ((onButton && line.querySelector<HTMLElement>(".notifications-mark-read")) || line.querySelector<HTMLElement>("a"))?.focus();
}

/** Its button comes and goes with it being unread. Focus stays on the line if it was on that button. */
function setState(li: HTMLElement, state: ItemState) {
  li.className = state;
  const button = li.querySelector<HTMLElement>(".notifications-mark-read");
  if (state === "unread" && !button) {
    li.appendChild(markButton("notifications-mark-read"));
  } else if (state !== "unread" && button) {
    const hadFocus = button.contains(document.activeElement);
    button.remove();
    if (hadFocus) li.querySelector<HTMLElement>("a")?.focus();
  }
}

/**
 * Takes lines out of the list, wiping them away over what takes their place, as the bell's panel does.
 * Focus goes to the line that takes the place of the one that had it, on the same kind of control if it has one.
 * @returns how to put them back
 */
function leave(targets: HTMLElement[]) {
  const focused = document.activeElement as HTMLElement | null;
  const from = targets.find((li) => li.contains(focused));
  if (from) {
    const onButton = !!focused?.closest(".notifications-mark-read");
    const all = Array.from(lines());
    const rest = all.filter((li) => !targets.includes(li));
    //The next one that stays, or the one before if there's none
    const index = all.indexOf(from);
    const line = all.slice(index).find((li) => rest.includes(li)) ?? rest[rest.length - 1];
    const target = (onButton && line?.querySelector<HTMLElement>(".notifications-mark-read")) || line?.querySelector<HTMLElement>("a, .btn");
    (target ?? section!.querySelector<HTMLElement>("input"))?.focus();
  }
  const visible = new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const places = targets.map((li) => ({ li, next: li.nextElementSibling, rect: li.getBoundingClientRect() }));
  for (const { li } of places) li.remove();
  //A copy: the line itself may have to come back before it's done
  for (const { li, rect } of places) wipeAway(li.cloneNode(true) as HTMLElement, rect, section!, visible);
  return () => {
    for (const { li, next } of places.reverse()) list!.insertBefore(li, next?.parentElement === list ? next : null);
  };
}

/** A list that follows is out of sight while it's empty */
function showIfAny() {
  section!.hidden = !lines().length;
}

/**
 * Nothing left: whatever's on the next page, or that there's nothing.
 * Not for a list that follows: it's on a page that has more to it, and the list isn't paged. It's out of sight instead.
 */
function reloadIfEmpty() {
  if (lines().length) return;
  setTimeout(() => (follows.length ? showIfAny() : window.location.reload()), LEAVE_DURATION);
}

/** Without what came out of it: for when the server can't be asked */
function update(li: HTMLElement, item: NotificationItem) {
  const state = stateOf(item);
  if (li.className === state) return;
  li.querySelector("ui-icon, cube-loader")?.replaceWith(statusIcon(item));
  const text = li.querySelector(".notifications-content > a, .notifications-content > span");
  if (text) text.textContent = messageOf(item);
  setState(li, state);
}

/** What's been asked of the server already, as `id:state`: what it doesn't draw (it may be gone) isn't asked again */
const asked = new Set<string>();
/** What to ask for next: notifications, and the tasks of those this page has started, that the stream may not have told about yet */
const wanted = { ids: new Set<number>(), tasks: new Set<number>() };
let drawing = false;

/** Asks for it, unless it has been already, as it is now */
function want(item: NotificationItem) {
  const key = `${item.notification_id}:${stateOf(item)}`;
  if (asked.has(key)) return;
  asked.add(key);
  wanted.ids.add(item.notification_id);
}

/** As the server draws them now */
async function fetchLines(ids: number[], tasks: number[]) {
  const query = new URLSearchParams([...ids.map((id) => ["id", id.toString()]), ...tasks.map((id) => ["task", id.toString()])]);
  const res = await fetch(`/ui/user/notifications/lines?${query}`, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const template = document.createElement("template");
  template.innerHTML = await res.text();
  //Not with :scope, which a fragment hasn't
  return Array.from(template.content.children).filter((el): el is HTMLElement => el.matches("li[data-notification-id]"));
}

/**
 * Those that changed are replaced, new ones go first: they're the newest. What has been read since is left to leave.
 * Only a list that follows takes new ones.
 */
function place(fresh: HTMLElement[]) {
  const added: HTMLElement[] = [];
  for (const li of fresh) {
    const id = idOf(li);
    const item = getItem(id);
    if (item && stateOf(item) === "read" && unreadOnly) continue;
    const old = lineOf(id);
    if (old) replace(old, li);
    else if (follows.length) added.push(li);
  }
  list!.prepend(...added);
  if (follows.length) showIfAny();
  updateMarkAll();
}

/** Asks for what's wanted, one request at a time: what's wanted meanwhile is asked for after it */
async function draw() {
  if (drawing || (!wanted.ids.size && !wanted.tasks.size)) return;
  drawing = true;
  const ids = [...wanted.ids], tasks = [...wanted.tasks];
  wanted.ids.clear();
  wanted.tasks.clear();
  try {
    place(await fetchLines(ids, tasks));
  } catch (e) {
    console.warn("Couldn't draw the latest notifications:", e);
    for (const id of ids) {
      const li = lineOf(id), item = getItem(id);
      if (li && item) update(li, item);
    }
  } finally {
    drawing = false;
    draw();
  }
}

function updateMarkAll() {
  if (markAll) markAll.hidden = !list!.querySelector(":scope > li.unread");
}

/** Shows it right away, as the bell does, and takes it back if it didn't work */
async function mark(targets: HTMLElement[]) {
  const putBack = unreadOnly ? leave(targets) : undefined;
  if (!putBack) for (const li of targets) setState(li, "read");
  updateMarkAll();
  if (await markAsRead(targets.map(idOf))) {
    if (unreadOnly) reloadIfEmpty();
    return;
  }
  putBack?.();
  for (const li of targets) {
    const item = getItem(idOf(li));
    setState(li, item ? stateOf(item) : "unread");
  }
  updateMarkAll();
}

if (list && section) {
  document.addEventListener("activity-change", () => {
    const before = lines().length;
    const leaving: HTMLElement[] = [];
    for (const li of lines()) {
      const item = getItem(idOf(li));
      if (!item || li.className === stateOf(item)) continue;
      //Read elsewhere: nothing else has changed
      if (stateOf(item) === "read") {
        if (unreadOnly) leaving.push(li);
        else setState(li, "read");
      } else {
        want(item);
      }
    }
    if (leaving.length) leave(leaving);
    for (const item of listItems()) {
      if (follows.includes(item.type) && stateOf(item) !== "read" && !lineOf(item.notification_id)) want(item);
    }
    draw();
    updateMarkAll();
    if (lines().length < before) reloadIfEmpty();
  });
  //Started from this page (see UploadManager): it's shown even if the stream hasn't told about it yet, or can't
  if (follows.length) {
    document.addEventListener("activity-started", (e) => {
      wanted.tasks.add((e as CustomEvent<{ task_id: number }>).detail.task_id);
      draw();
    });
  }

  const onActivate = (e: Event) => {
    const target = e.target as HTMLElement;
    const li = target.closest<HTMLElement>("li.unread");
    //What's out of sight until it's asked for is there to be looked through: one of it doesn't read the rest
    if (!li || target.closest("details") || !followsLink(e) || !target.closest("a, .notifications-mark-read")) return;
    mark([li]);
  };
  list.addEventListener("click", onActivate);
  //Middle click: the link opens in another tab
  list.addEventListener("auxclick", onActivate);

  //Those of this page only
  markAll?.addEventListener("click", () => {
    const unread = Array.from(list.querySelectorAll<HTMLElement>(":scope > li.unread"));
    //It's going away: focus goes to what it was about, or to what stays when that goes too
    const stays = unreadOnly ? list.querySelector<HTMLElement>(":scope > li:not(.unread)") : unread[0];
    (stays?.querySelector<HTMLElement>("a") ?? section.querySelector<HTMLElement>("input"))?.focus();
    mark(unread);
  });
}
