/**
 * The list of unread notifications that opens from the bell in the navbar. It's a native popover, so
 * this has nothing to do with opening it. It only asks for the list then, as most page views will never need it.
 */
import { isRead, markAsRead, ReadNotifications, reportMarkFailure } from "./markRead";
import { setUnread } from "./unreadBadge";

//As much as the API gives. This is the only place to find what's unread: it scrolls.
const LIMIT = 100;

const panel = document.querySelector<HTMLElement>("#nav-notifications-panel");
const list = panel?.querySelector<HTMLElement>("ul");
const empty = panel?.querySelector<HTMLElement>("p");
const markAll = panel?.querySelector<HTMLButtonElement>(".nav-notifications-mark-all");

let loading = false;
let outdated = false;

function showState() {
  const items = list!.children;
  empty!.hidden = items.length !== 0;
  markAll!.hidden = items.length === 0;
  if (items.length) markAll!.dataset.upTo = (items[0] as HTMLElement).dataset.notificationId;
}

function markButton() {
  const button = document.createElement("button");
  button.className = "btn btn-transparent btn-icon";
  button.type = "button";
  button.title = panel!.dataset.markRead ?? "";
  button.setAttribute("aria-label", button.title);
  const icon = document.createElement("ui-icon");
  icon.setAttribute("name", "check-check");
  button.appendChild(icon);
  return button;
}

/**
 * Runs something that may remove what has the focus, which would close the list on someone using a keyboard.
 */
function keepingFocus(change: () => void) {
  const hadFocus = panel!.contains(document.activeElement);
  change();
  if (hadFocus && !panel!.contains(document.activeElement)) {
    (list!.children.length ? markAll! : document.querySelector<HTMLElement>("#nav-notifications")!).focus();
  }
}

interface ListedNotification {
  notification_id: number;
  message: string;
  link: string | null;
  task: { status: string } | null;
}

/** Tells at a glance how things went, as titles may be cut before they get to it */
function statusIcon(status?: string) {
  const [name, color] = status === "error" ? ["error", "text-error"]
    : status === "success" ? ["check", "text-success"]
    : ["info", "text-info"];
  const icon = document.createElement("ui-icon");
  icon.className = color;
  icon.setAttribute("name", name);
  return icon;
}

function render(notifications: ListedNotification[]) {
  const items = notifications.map(({ notification_id, message, link, task }) => {
    const item = document.createElement("li");
    item.dataset.notificationId = notification_id.toString();
    const title = document.createElement(link ? "a" : "div");
    if (link) title.setAttribute("href", link);
    //It may get cut
    title.title = message;
    const text = document.createElement("span");
    text.textContent = message;
    title.append(statusIcon(task?.status), text);
    item.appendChild(title);
    item.appendChild(markButton());
    return item;
  });
  keepingFocus(() => {
    list!.replaceChildren(...items);
    showState();
  });
}

async function refresh() {
  if (loading) {
    outdated = true;
    return;
  }
  loading = true;
  try {
    const res = await fetch(`/notifications?status=unread&limit=${LIMIT}`, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`);
    const notifications = await res.json() as ListedNotification[];
    render(notifications);
    //Another tab may have read some. When there are more than what's listed, it wouldn't be the actual count.
    if (notifications.length < LIMIT) setUnread(notifications.length, notifications.some(n => n.task?.status === "error"));
  } catch (e) {
    console.warn("Failed to list notifications:", e);
  } finally {
    loading = false;
    if (outdated) {
      outdated = false;
      refresh();
    }
  }
}

/** To be called when there's something new, in case someone's looking at it */
export function refreshNotificationsMenu() {
  if (panel?.matches(":popover-open")) refresh();
}

if (panel && list && empty && markAll) {
  panel.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState === "open") refresh();
  });

  const onActivate = (e: Event) => {
    const item = (e.target as HTMLElement).closest<HTMLElement>("li");
    if (!item || !(e.target as HTMLElement).closest("a, button")) return;
    markAsRead({ ids: [parseInt(item.dataset.notificationId!, 10)] }).catch(reportMarkFailure);
  };
  list.addEventListener("click", onActivate);
  //Middle click: the link opens in another tab
  list.addEventListener("auxclick", onActivate);

  markAll.addEventListener("click", () => {
    markAll.disabled = true;
    markAsRead({ up_to: parseInt(markAll.dataset.upTo!, 10) })
      .catch(reportMarkFailure)
      .finally(() => {
        markAll.disabled = false;
      });
  });

  document.addEventListener("notifications-read", (e) => {
    const { detail } = e as CustomEvent<ReadNotifications>;
    //What's being listed may have been read before this happened
    if (loading) outdated = true;
    keepingFocus(() => {
      for (const item of Array.from(list.children) as HTMLElement[]) {
        if (isRead(detail, parseInt(item.dataset.notificationId!, 10))) item.remove();
      }
      showState();
    });
  });
}
