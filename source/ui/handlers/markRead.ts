/**
 * Marking notifications as read, for what's shown in the navbar and in the pages listing them.
 * Those can be in separate bundles: they find out about each other through an event on `document`.
 */
import { notify } from "./notify";
import { setUnread } from "./unreadBadge";

export type ReadNotifications = { ids: number[] } | { up_to: number };

/** Whether a notification is part of what's been marked as read */
export function isRead(which: ReadNotifications, id: number) {
  return "ids" in which ? which.ids.includes(id) : id <= which.up_to;
}

/** keepalive: it may have to outlive the page, when following a link */
export async function markAsRead(which: ReadNotifications): Promise<void> {
  const res = await fetch("/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(which),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`);
  const { unread, unread_errors } = await res.json() as { unread: number, unread_errors: number };
  setUnread(unread, 0 < unread_errors);
  document.dispatchEvent(new CustomEvent<ReadNotifications>("notifications-read", { detail: which }));
}

export function reportMarkFailure(e: unknown) {
  console.error("Failed to mark notifications as read:", e);
  const message = document.querySelector<HTMLElement>("#nav-notifications-panel")?.dataset.markFailed;
  notify(message ?? "Error", "error", 5000);
}

/** Whether a click opens the link it's on: a right click also counts as an "auxclick", but it only opens a menu */
export function followsLink(e: Event) {
  return e.type === "click" || (e as MouseEvent).button === 1;
}
