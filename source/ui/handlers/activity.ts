/**
 * Follows the current user's activity: their notifications, including those of tasks still running.
 *
 * Loaded on the pages of logged-in users only, so it's kept small: no Lit in there.
 * Toasts rely on the custom elements registered by the main bundle.
 *
 * The server keeps all the state, and every stream starts with it: whatever goes wrong gets fixed by connecting again.
 * EventSource does that by itself after a network error, or when the server ends the stream.
 * It gives up on an answer that isn't the stream: then it's tried again from here, later.
 */
import { linkOf, messageOf } from "../activity/panel";
import { getStatus, itemsIn, setItems, setStatus, updateItem } from "../activity/state";
import { DeletedNotification, NotificationItem, stateOf } from "../state/notifications";
import { toast } from "../state/toast";

/** Forgotten tabs are what would otherwise make up most open streams */
const HIDDEN_GRACE = 2 * 60 * 1000;
/** The server pings every 30 seconds: a connection that's silent for longer than that is dead */
const STALL_TIMEOUT = 75 * 1000;
/** After an answer that isn't the stream. Refusals say 30 seconds: trying again sooner wouldn't help. */
const REFUSED_DELAY = 30 * 1000;
/** How long to display a toast. Even for an error: they can all be found again from the bell. */
const TOAST_TIMEOUT = 10 * 1000;

const url = document.querySelector<HTMLElement>("#nav-notifications")?.dataset.activity ?? "";

let source: EventSource | null = null;
/** The next attempt, once EventSource has given up */
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let stallTimer: ReturnType<typeof setTimeout> | undefined;
let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
/**
 * What was running when we last knew: what has settled since then gets a toast.
 * A new page starts with nothing in there: it doesn't toast what was already there.
 */
let running = new Set<number>();


/** Tells about something that has just settled, for those who are looking */
function toastItem(item: NotificationItem) {
  if (document.hidden) return;
  const level = item.status === "error" ? "error" : item.status === "success" ? "success" : "info";
  toast(messageOf(item), level, TOAST_TIMEOUT, linkOf(item) ?? undefined);
}

/** Whether it's become something to tell about: unread, and not before */
function hasSettled(item: NotificationItem, wasRunning: boolean) {
  return wasRunning && stateOf(item) === "unread";
}

function onState(items: NotificationItem[]) {
  setItems(items);
  //What settled while disconnected
  for (const item of items) if (hasSettled(item, running.has(item.notification_id))) toastItem(item);
  running = new Set(itemsIn("running").map((n) => n.notification_id));
}

function onChange(change: NotificationItem | DeletedNotification) {
  const previous = updateItem(change);
  running.delete(change.notification_id);
  if ("deleted" in change) return;
  if (stateOf(change) === "running") running.add(change.notification_id);
  //A new one that's settled from the start is news too (it isn't about a task)
  else if (hasSettled(change, !previous || stateOf(previous) === "running")) toastItem(change);
}

/**
 * EventSource reports the server ending a stream the same way as a failure: a first error after having been live
 * only shows as reconnecting. It's offline if it fails again before the server has told everything.
 */
function onError() {
  setStatus(getStatus() === "live" ? "loading" : "offline");
}

function close() {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  clearTimeout(stallTimer);
  source?.close();
  source = null;
}

/** Heard from the server: the connection is alive */
function watch() {
  clearTimeout(stallTimer);
  stallTimer = setTimeout(() => {
    close();
    onError();
    connect();
  }, STALL_TIMEOUT);
}

function connect() {
  if (source) return;
  close();
  //Offline stays so until it works
  if (getStatus() !== "offline") setStatus("loading");
  const es = source = new EventSource(url);
  es.addEventListener("state", (e) => {
    watch();
    onState((JSON.parse(e.data) as { notifications: NotificationItem[] }).notifications);
  });
  es.addEventListener("notification", (e) => {
    watch();
    onChange(JSON.parse(e.data));
  });
  es.addEventListener("ping", watch);
  es.addEventListener("error", () => {
    if (source !== es) return;
    onError();
    if (es.readyState !== EventSource.CLOSED) return;
    close();
    //Not before the server said
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      if (!document.hidden) connect();
    }, REFUSED_DELAY * (1 + Math.random() / 2));
  });
  watch();
}

function onVisibilityChange() {
  clearTimeout(hiddenTimer);
  if (document.hidden) hiddenTimer = setTimeout(close, HIDDEN_GRACE);
  //Not while waiting to try again: that's how long it waits, whoever's looking
  else if (!source && !retryTimer) connect();
}

if (url) {
  document.addEventListener("visibilitychange", onVisibilityChange);
  //Someone wants to see what's there: no point in waiting to try again
  document.querySelector("#nav-notifications-panel")?.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState === "open" && getStatus() === "offline") {
      close();
      connect();
    }
  });
  //An open stream would keep the page out of the back/forward cache
  window.addEventListener("pagehide", close);
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) connect();
  });
  //A tab opened in the background waits for someone to look at it
  const start = () => {
    if (!document.hidden) connect();
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
