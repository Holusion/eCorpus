/**
 * What's known of the current user's activity: their notifications, as the server last told.
 * Everything here is derived from them: the bell's badge, its "running" state, the panel's list.
 * And how far it can be trusted: see Status.
 *
 * Changes are announced with an `activity-change` event on `document`.
 */
import { DeletedNotification, ItemState, NotificationItem, stateOf } from "../state/notifications";

/**
 * Where following them stands, as the bell's `data-status`. Without one, it hasn't started.
 * - "loading": connecting, or connecting again. What's shown, if anything, is what was last known.
 * - "live": what's shown is what the server says.
 * - "offline": the latest attempt failed. What's shown, if anything, may be out of date.
 */
export type Status = "loading" | "live" | "offline";

const items = new Map<number, NotificationItem>();
/** Whether the server has told at least once: until then, there's nothing to show */
let loaded = false;
let status: Status | null = null;

function bell() {
  return document.querySelector<HTMLElement>("#nav-notifications");
}

/** Newest first: the last to have changed, as the server has them */
export function listItems(): NotificationItem[] {
  return Array.from(items.values()).sort((a, b) => Date.parse(b.mtime) - Date.parse(a.mtime) || b.notification_id - a.notification_id);
}

/** As last told by the server, if it has told about it */
export function getItem(id: number): NotificationItem | undefined {
  return items.get(id);
}

/** Newest first */
export function itemsIn(state: ItemState): NotificationItem[] {
  return listItems().filter((n) => stateOf(n) === state);
}

export function isLoaded() {
  return loaded;
}

export function getStatus() {
  return status;
}

function changed() {
  render();
  document.dispatchEvent(new CustomEvent("activity-change"));
}

/** Replaces everything that's known, as the server has just told it */
export function setItems(list: NotificationItem[]) {
  loaded = true;
  status = "live";
  items.clear();
  for (const item of list) items.set(item.notification_id, item);
  changed();
}

/** @returns what it was before that */
export function updateItem(change: NotificationItem | DeletedNotification): NotificationItem | undefined {
  const previous = items.get(change.notification_id);
  if ("deleted" in change) items.delete(change.notification_id);
  else items.set(change.notification_id, change);
  changed();
  return previous;
}

/** It only gets "live" from the server: see setItems */
export function setStatus(next: Exclude<Status, "live">) {
  if (status === next) return;
  status = next;
  changed();
}

/**
 * Sets what's been marked here, without waiting to hear it back from the server
 * @returns the ids that changed
 */
export function setRead(ids: number[], read = true): number[] {
  const changes = ids.filter((id) => items.has(id) && items.get(id)!.read !== read);
  for (const id of changes) items.set(id, { ...items.get(id)!, read });
  if (changes.length) changed();
  return changes;
}

/**
 * Shows it on the bell: a count of what's unread, colored by whether any of it failed, whether anything is running,
 * and the status. Not being live doesn't hide any of the rest: it's still what was last known.
 */
function render() {
  const el = bell();
  const badge = el?.querySelector<HTMLElement>(".nav-badge");
  if (!el || !badge) return;
  const unread = itemsIn("unread");
  badge.dataset.count = unread.length.toString();
  badge.dataset.level = unread.some((n) => n.status === "error") ? "error" : "success";
  badge.setAttribute("aria-label", unread.length.toString());
  badge.hidden = unread.length === 0;
  el.toggleAttribute("data-running", 0 < itemsIn("running").length);
  if (status) el.dataset.status = status;
  el.querySelector("ui-icon")?.setAttribute("name", status === "offline" ? "warning" : "bell");
}
