/**
 * Acting on notifications from a page listing them, which only has to mark them with `data-notification-id`.
 * Opening a page doesn't count as reading them: a failure someone hasn't had time to look at shouldn't go away by itself.
 */
import { followsLink, isRead, markAsRead, ReadNotifications, reportMarkFailure } from "./markRead";
import { notify } from "./notify";
import { setUnread } from "./unreadBadge";

const list = document.querySelector<HTMLElement>("[data-notifications]");
const markAll = document.querySelector<HTMLButtonElement>("#inbox-mark-all");

function onActivate(e: Event) {
  const target = e.target as HTMLElement;
  const item = target.closest<HTMLElement>("[data-notification-id].unread");
  if (!item || !followsLink(e) || !target.closest(".inbox-mark-read, a.inbox-item-message")) return;
  markAsRead({ ids: [parseInt(item.dataset.notificationId!, 10)] }).catch(reportMarkFailure);
}

/** The task it's about isn't affected. Nothing brings it back. */
async function deleteNotification(item: HTMLElement) {
  const res = await fetch(`/notifications/${item.dataset.notificationId}`, { method: "DELETE", headers: { Accept: "application/json" } });
  if (res.ok) {
    const { unread, unread_errors } = await res.json() as { unread: number, unread_errors: number };
    setUnread(unread, 0 < unread_errors);
  } else if (res.status !== 404) { //That one's already gone, from another tab
    throw new Error(`[${res.status}] ${res.statusText}`);
  }
  item.remove();
  //What the page says when there's nothing, and the way to the pages around it
  if (!list!.children.length) window.location.reload();
}

function onDelete(e: MouseEvent) {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>(".inbox-delete");
  //The end of a double click isn't meant for what's come under the pointer, be it this button or the next row's
  if (!button || 1 < e.detail) return;
  button.disabled = true;
  deleteNotification(button.closest<HTMLElement>("[data-notification-id]")!).catch((err) => {
    console.error("Failed to delete a notification:", err);
    notify(list!.dataset.deleteFailed ?? "Error", "error", 5000);
    button.disabled = false;
  });
}

list?.addEventListener("click", onDelete);
list?.addEventListener("click", onActivate);
//Middle click: the link opens in another tab
list?.addEventListener("auxclick", onActivate);

markAll?.addEventListener("click", () => {
  markAll.disabled = true;
  markAsRead({ up_to: parseInt(markAll.dataset.upTo!, 10) })
    .catch(reportMarkFailure)
    .finally(() => {
      markAll.disabled = false;
    });
});

//It may also come from the navbar
document.addEventListener("notifications-read", (e) => {
  const { detail } = e as CustomEvent<ReadNotifications>;
  list?.querySelectorAll<HTMLElement>("[data-notification-id].unread").forEach((item) => {
    if (!isRead(detail, parseInt(item.dataset.notificationId!, 10))) return;
    item.classList.remove("unread");
  });
  if (markAll && "up_to" in detail && parseInt(markAll.dataset.upTo!, 10) <= detail.up_to) markAll.remove();
});
