/**
 * Marking notifications as read, in the inbox page.
 * Opening the page doesn't: a failure someone hasn't had time to look at shouldn't go away by itself.
 */
import { isRead, markAsRead, ReadNotifications, reportMarkFailure } from "./markRead";

const list = document.querySelector<HTMLElement>(".inbox");
const markAll = document.querySelector<HTMLButtonElement>("#inbox-mark-all");

function onActivate(e: Event) {
  const target = e.target as HTMLElement;
  const item = target.closest<HTMLElement>(".inbox-item.unread");
  if (!item || !target.closest(".inbox-mark-read, a.inbox-item-message")) return;
  markAsRead({ ids: [parseInt(item.dataset.notificationId!, 10)] }).catch(reportMarkFailure);
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

//It may also come from the navbar
document.addEventListener("notifications-read", (e) => {
  const { detail } = e as CustomEvent<ReadNotifications>;
  list?.querySelectorAll<HTMLElement>(".inbox-item.unread").forEach((item) => {
    if (!isRead(detail, parseInt(item.dataset.notificationId!, 10))) return;
    item.classList.remove("unread");
    item.querySelector(".inbox-mark-read")?.remove();
  });
  if (markAll && "up_to" in detail && parseInt(markAll.dataset.upTo!, 10) <= detail.up_to) markAll.remove();
});
