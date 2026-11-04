/**
 * Marking notifications as read and deleting them, for what's shown in the navbar and in the pages listing them.
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

/** Deletes a notification. The task it's about isn't affected. */
export async function deleteNotification(id: number): Promise<void> {
  const res = await fetch(`/notifications/${id}`, { method: "DELETE", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`);
  const { unread, unread_errors } = await res.json() as { unread: number, unread_errors: number };
  setUnread(unread, 0 < unread_errors);
  document.dispatchEvent(new CustomEvent<number>("notification-deleted", { detail: id }));
}

function reportFailure(e: unknown, message?: string) {
  console.error("Failed to update notifications:", e);
  notify(message ?? "Error", "error", 5000);
}

const panelData = () => document.querySelector<HTMLElement>("#nav-notifications-panel")?.dataset;
export const reportMarkFailure = (e: unknown) => reportFailure(e, panelData()?.markFailed);
export const reportDeleteFailure = (e: unknown) => reportFailure(e, panelData()?.deleteFailed);

/** Whether a click opens the link it's on: a right click also counts as an "auxclick", but it only opens a menu */
export function followsLink(e: Event) {
  return e.type === "click" || (e as MouseEvent).button === 1;
}
