/**
 * Acting on notifications from a page listing them, which only has to mark them with `data-notification-id`.
 * Opening a page doesn't count as reading them: a failure someone hasn't had time to look at shouldn't go away by itself.
 */
import { deleteNotification, followsLink, isRead, markAsRead, ReadNotifications, reportDeleteFailure, reportMarkFailure } from "./markRead";

const list = document.querySelector<HTMLElement>("[data-notifications]");
const markAll = document.querySelector<HTMLButtonElement>("#inbox-mark-all");

function onActivate(e: Event) {
  const target = e.target as HTMLElement;
  const item = target.closest<HTMLElement>("[data-notification-id]");
  if (!item || !followsLink(e)) return;
  const id = parseInt(item.dataset.notificationId!, 10);
  if (target.closest(".inbox-delete")) {
    if (e.type === "click") deleteNotification(id).catch(reportDeleteFailure);
  } else if (item.classList.contains("unread") && target.closest(".inbox-mark-read, a.inbox-item-message")) {
    markAsRead({ ids: [id] }).catch(reportMarkFailure);
  }
}

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

document.addEventListener("notification-deleted", (e) => {
  list?.querySelector(`[data-notification-id="${(e as CustomEvent<number>).detail}"]`)?.remove();
});

//It may also come from the navbar
document.addEventListener("notifications-read", (e) => {
  const { detail } = e as CustomEvent<ReadNotifications>;
  list?.querySelectorAll<HTMLElement>("[data-notification-id].unread").forEach((item) => {
    if (!isRead(detail, parseInt(item.dataset.notificationId!, 10))) return;
    item.classList.remove("unread");
    item.querySelector(".inbox-mark-read")?.remove();
  });
  if (markAll && "up_to" in detail && parseInt(markAll.dataset.upTo!, 10) <= detail.up_to) markAll.remove();
});
