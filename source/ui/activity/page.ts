/**
 * Lists of notifications that the server draws: the page of a user's notifications (/ui/user/notifications),
 * read or not, a page at a time, and what the upload page has started.
 * What the stream tells about them shows there too. The page of notifications doesn't add what's come since: the bell has that.
 * With only those that are unread, what gets read leaves it, as it leaves the bell's panel.
 *
 * A list can follow notifications of some types, with `data-follow` (the upload page's): then what's new of those types is added,
 * and lines are drawn again by the server when they change, as it knows what came out of them.
 * That list is out of sight while it's empty: it's there for what comes.
 * There, a notification can have several lines: an archive's import, then each of its scenes (with `data-part`).
 * They change together, they're read together, and they leave together. Only the first one can be marked.
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

/** The lines of a notification: one, or those of an archive's scenes after the import's own */
function linesOf(id: number) {
  return Array.from(list!.querySelectorAll<HTMLElement>(`:scope > li[data-notification-id="${id}"]`));
}

/** In their place, with focus where it was in them: on the same kind of control if they have one */
function replace(old: HTMLElement[], fresh: HTMLElement[]) {
  const focused = document.activeElement as HTMLElement | null;
  const had = focused ? old.find((li) => li.contains(focused)) : undefined;
  const onButton = !!had && !!focused!.closest(".notifications-mark-read");
  old[0].replaceWith(...fresh);
  for (const li of old.slice(1)) li.remove();
  if (!had) return;
  const line = fresh[Math.min(old.indexOf(had), fresh.length - 1)];
  const button = onButton ? fresh.find((li) => li.querySelector(".notifications-mark-read"))?.querySelector<HTMLElement>(".notifications-mark-read") : null;
  (button ?? line.querySelector<HTMLElement>("a"))?.focus();
}

/** Its button comes and goes with it being unread, if it's not part of another line's. Focus stays on the line if it was on that button. */
function setState(li: HTMLElement, state: ItemState) {
  li.className = state;
  const button = li.querySelector<HTMLElement>(".notifications-mark-read");
  if (state === "unread" && !button && !li.dataset.part) {
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

/** What's been asked of the server already, as `id:state`: what it doesn't draw (there's a limit) isn't asked again */
const asked = new Set<string>();

/** Whether the server draws something that isn't shown yet, as far as what the stream has told goes */
function outdated() {
  let any = false;
  for (const item of listItems()) {
    const state = stateOf(item);
    if (state === "read" || !follows.includes(item.type) || linesOf(item.notification_id)[0]?.className === state) continue;
    const key = `${item.notification_id}:${state}`;
    if (asked.has(key)) continue;
    asked.add(key);
    any = true;
  }
  return any;
}

/** As the server draws them now: the same page, which has them */
async function fetchLines() {
  const res = await fetch(window.location.href, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  return Array.from(doc.querySelectorAll<HTMLElement>("[data-notifications] > li[data-notification-id]"));
}

/**
 * Those that changed are replaced, new ones go where the server put them. What's leaving, or has been read since, is left to leave.
 * What the server didn't draw is left as it is: what happens to it will show.
 */
function place(fresh: HTMLElement[]) {
  const groups = new Map<number, HTMLElement[]>();
  for (const li of fresh) groups.set(idOf(li), [...(groups.get(idOf(li)) ?? []), li]);
  const next: HTMLElement[] = [];
  for (const [id, group] of groups) {
    const old = linesOf(id);
    const item = getItem(id);
    if (old.length === group.length && old.every((li, i) => li.className === group[i].className)) next.push(...old);
    else if (!item || stateOf(item) !== "read") {
      const lines = group.map((li) => document.adoptNode(li));
      if (old.length) replace(old, lines);
      next.push(...lines);
    }
  }
  let cursor = list!.firstElementChild;
  for (const li of next) {
    if (li === cursor) cursor = li.nextElementSibling;
    else list!.insertBefore(li, cursor);
  }
  showIfAny();
  updateMarkAll();
}

let drawing: Promise<void> | null = null;
/** Something else changed while it was being drawn: it may not be in there */
let again = false;

/** Shows what the server draws now. If that can't be done, the lines show what the stream tells, without what came out of them. */
function redraw() {
  if (drawing) {
    again = true;
    return;
  }
  drawing = fetchLines().then(place, (e) => {
    console.warn("Couldn't draw the latest notifications:", e);
    for (const li of lines()) {
      const item = getItem(idOf(li));
      if (item && stateOf(item) !== "read") update(li, item);
    }
  }).finally(() => {
    drawing = null;
    if (again) {
      again = false;
      redraw();
    }
  });
}

/** How it is now: its task may have settled since the server drew it. What a part says is its own. */
function update(li: HTMLElement, item: NotificationItem) {
  const state = stateOf(item);
  if (li.className === state) return;
  li.querySelector("ui-icon")?.replaceWith(statusIcon(item));
  const text = li.querySelector(".notifications-content > a, .notifications-content > span");
  if (text && !li.dataset.part) text.textContent = messageOf(item);
  setState(li, state);
}

function updateMarkAll() {
  if (markAll) markAll.hidden = !list!.querySelector(":scope > li.unread");
}

/** Shows it right away, as the bell does, on all of their lines, and takes it back if it didn't work */
async function mark(ids: number[]) {
  const targets = Array.from(lines()).filter((li) => ids.includes(idOf(li)));
  const putBack = unreadOnly ? leave(targets) : undefined;
  if (!putBack) for (const li of targets) setState(li, "read");
  updateMarkAll();
  if (await markAsRead(ids)) {
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
    //All at once: the lines of a notification leave together
    const leaving: HTMLElement[] = [];
    for (const li of lines()) {
      const item = getItem(idOf(li));
      if (!item || li.className === stateOf(item)) continue;
      if (unreadOnly && stateOf(item) === "read") leaving.push(li);
      //In a list that follows, the server draws them again
      else if (!follows.length) update(li, item);
    }
    if (leaving.length) leave(leaving);
    if (follows.length && outdated()) redraw();
    updateMarkAll();
    if (lines().length < before) reloadIfEmpty();
  });
  //Started from this page (see UploadManager): it's shown even if the stream hasn't told about it yet, or can't
  if (follows.length) document.addEventListener("activity-started", () => redraw());

  const onActivate = (e: Event) => {
    const target = e.target as HTMLElement;
    const li = target.closest<HTMLElement>("li.unread");
    //The scenes of an archive: there may be others to see
    if (!li || li.dataset.part || !followsLink(e) || !target.closest("a, .notifications-mark-read")) return;
    mark([idOf(li)]);
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
    mark([...new Set(unread.map(idOf))]);
  });
}
