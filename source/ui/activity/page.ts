/**
 * The page of a user's notifications (/ui/user/notifications), read or not, which the server draws a page at a time.
 * What the stream tells about them shows there too. It doesn't add what's come since: the bell has that.
 * With only those that are unread, what gets read leaves it, as it leaves the bell's panel.
 *
 * In the activity bundle, as it shares what the stream has told with the bell: bundles don't share modules.
 */
import { NotificationItem, ItemState, stateOf } from "../state/notifications";
import { getItem } from "./state";
import { followsLink, markAsRead } from "./markRead";
import { markButton, messageOf, statusIcon } from "./panel";
import { LEAVE_DURATION, wipeAway } from "./leave";

const list = document.querySelector<HTMLElement>("[data-notifications]");
const section = list?.closest<HTMLElement>(".notifications-page");
const markAll = section?.querySelector<HTMLButtonElement>(".notifications-mark-all");
const unreadOnly = list?.hasAttribute("data-unread-only") ?? false;

function lines() {
  return list!.querySelectorAll<HTMLElement>(":scope > li[data-notification-id]");
}

function idOf(li: HTMLElement) {
  return parseInt(li.dataset.notificationId!, 10);
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

/** Nothing left: whatever's on the next page, or that there's nothing */
function reloadIfEmpty() {
  if (!lines().length) setTimeout(() => window.location.reload(), LEAVE_DURATION);
}

/** How it is now: its task may have settled since the server drew it */
function update(li: HTMLElement, item: NotificationItem) {
  const state = stateOf(item);
  if (li.className === state) return;
  if (unreadOnly && state === "read") {
    leave([li]);
    return;
  }
  li.querySelector("ui-icon")?.replaceWith(statusIcon(item));
  const text = li.querySelector(".notifications-content > a, .notifications-content > span");
  if (text) text.textContent = messageOf(item);
  setState(li, state);
}

function updateMarkAll() {
  markAll!.hidden = !list!.querySelector(":scope > li.unread");
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

if (list && section && markAll) {
  document.addEventListener("activity-change", () => {
    const before = lines().length;
    for (const li of lines()) {
      const item = getItem(idOf(li));
      if (item) update(li, item);
    }
    updateMarkAll();
    if (lines().length < before) reloadIfEmpty();
  });

  const onActivate = (e: Event) => {
    const target = e.target as HTMLElement;
    const li = target.closest<HTMLElement>("li.unread");
    if (!li || !followsLink(e) || !target.closest("a, .notifications-mark-read")) return;
    mark([li]);
  };
  list.addEventListener("click", onActivate);
  //Middle click: the link opens in another tab
  list.addEventListener("auxclick", onActivate);

  //Those of this page only
  markAll.addEventListener("click", () => {
    const unread = Array.from(list.querySelectorAll<HTMLElement>(":scope > li.unread"));
    //It's going away: focus goes to what it was about, or to what stays when that goes too
    const stays = unreadOnly ? list.querySelector<HTMLElement>(":scope > li:not(.unread)") : unread[0];
    (stays?.querySelector<HTMLElement>("a") ?? section.querySelector<HTMLElement>("input"))?.focus();
    mark(unread);
  });
}
