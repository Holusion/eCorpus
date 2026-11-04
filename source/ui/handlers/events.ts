/**
 * Listens to what happens to the current user's tasks, and to their inbox.
 *
 * Loaded on the pages of logged-in users only, so it's kept small: no Lit in there.
 * Toasts rely on the custom elements registered by the main bundle.
 *
 * The server keeps all the state. Whatever goes wrong here gets fixed by reconnecting:
 * every connection starts with a snapshot.
 */
import { notify } from "./notify";
import { refreshNotificationsMenu } from "./notificationsMenu";
import { SseFrame, SseParser } from "./sse";
import { addUnread, setUnread, showUnreadErrors } from "./unreadBadge";

/** Quick click-throughs shouldn't open a stream at all */
const OPEN_DELAY = 1500;
/** Forgotten tabs are what would otherwise make up most open streams */
const HIDDEN_GRACE = 2 * 60 * 1000;
/** The server pings every 30 seconds: a connection that's silent for longer than that is dead */
const STALL_TIMEOUT = 75 * 1000;
const MAX_BACKOFF = 60 * 1000;
/** How long to display a toast. Even for an error: they can all be found again from the bell. */
const TOAST_TIMEOUT = 10 * 1000;
/** Permanent refusals: retrying won't help until the next page load */
const REFUSED = [401, 403, 404];

interface TaskEvent {
  task_id: number;
  parent: number | null;
  type: string;
  status: string;
  scene_id: number | null;
  user_id: number | null;
}

//Has to be read right away: it's only set while the script is being first evaluated
const streamUrl = (document.currentScript as HTMLScriptElement | null)?.dataset.stream;

/** The running connection */
let connection: AbortController | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
let stopped = false;
let failures = 0;
/** The delay the server asks for between streams */
let retryDelay = 5000;
/** Tasks that are worth keeping a hidden tab connected for */
const activeTasks = new Set<number>();


function jitter(ms: number) {
  return ms * (0.5 + Math.random());
}

/**
 * A connection that was working is about to fail for everyone at once if the server restarts:
 * those use the delay it gave, that's spread out for that purpose.
 */
function nextFailureDelay() {
  const delay = failures === 0 ? retryDelay : 1000 * 2 ** failures;
  failures++;
  return jitter(Math.min(MAX_BACKOFF, delay));
}

function schedule(delay: number, action: () => void) {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    action();
  }, delay);
}

function disconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
  const c = connection;
  connection = null;
  c?.abort();
}

function trackTask({ task_id, status }: TaskEvent) {
  if (status === "pending" || status === "running") activeTasks.add(task_id);
  else activeTasks.delete(task_id);
}

/** Pages can follow tasks with this, without depending on this bundle */
function publishTask(task: TaskEvent) {
  document.dispatchEvent(new CustomEvent<TaskEvent>("task-event", { detail: task }));
}

function onFrame({ event, data, retry }: SseFrame) {
  if (retry !== undefined) retryDelay = retry;
  if (event === "snapshot") {
    const { tasks, unread, unread_errors } = JSON.parse(data) as { tasks: TaskEvent[], unread?: number, unread_errors?: number };
    failures = 0;
    activeTasks.clear();
    for (const task of tasks) {
      trackTask(task);
      publishTask(task);
    }
    if (typeof unread === "number") setUnread(unread, 0 < (unread_errors ?? 0));
  } else if (event === "task") {
    const task = JSON.parse(data) as TaskEvent;
    trackTask(task);
    publishTask(task);
  } else if (event === "notification") {
    addUnread(1);
    queueNotification(JSON.parse(data).notification_id);
    refreshNotificationsMenu();
  }
}

/**
 * Reads a stream until it ends.
 * @returns how long to wait before connecting again, or null to not do so
 */
async function readStream(url: string, c: AbortController): Promise<number | null> {
  let stall: ReturnType<typeof setTimeout> | undefined;
  const watch = () => {
    clearTimeout(stall);
    stall = setTimeout(() => c.abort(), STALL_TIMEOUT);
  };
  let connected = false;
  try {
    watch();
    const res = await fetch(url, { headers: { Accept: "text/event-stream" }, signal: c.signal });
    if (REFUSED.includes(res.status)) return null;
    if (!res.ok || !res.body) {
      const after = parseInt(res.headers.get("Retry-After") ?? "", 10);
      return 0 < after ? after * 1000 * (1 + Math.random() / 2) : nextFailureDelay();
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    while (true) {
      watch();
      const { done, value } = await reader.read();
      if (done) break;
      for (const frame of parser.feed(decoder.decode(value, { stream: true }))) {
        if (frame.event === "snapshot") connected = true;
        onFrame(frame);
      }
    }
  } finally {
    clearTimeout(stall);
  }
  //Something that answers and ends right away isn't the stream we want. It shouldn't be retried at full speed.
  return connected ? retryDelay : nextFailureDelay();
}

async function connect(url: string) {
  if (stopped || connection) return;
  const c = connection = new AbortController();
  let delay: number | null;
  try {
    delay = await readStream(url, c);
  } catch (e) {
    //Disconnected on purpose: whoever did that decides what happens next
    if (connection !== c) return;
    delay = nextFailureDelay();
  }
  if (connection !== c) return;
  connection = null;
  if (delay === null) stopped = true;
  else schedule(delay, () => connect(url));
}

function closeIfIdle() {
  hiddenTimer = undefined;
  if (activeTasks.size) hiddenTimer = setTimeout(closeIfIdle, HIDDEN_GRACE);
  else disconnect();
}

function onVisibilityChange(url: string) {
  clearTimeout(hiddenTimer);
  hiddenTimer = undefined;
  if (document.hidden) hiddenTimer = setTimeout(closeIfIdle, HIDDEN_GRACE);
  else if (!reconnectTimer) connect(url);
}

function open(url: string) {
  //A tab opened in the background waits for someone to look at it
  schedule(OPEN_DELAY, () => {
    if (!document.hidden) connect(url);
  });
}


let newIds = new Set<number>();
let newTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Frames only say that there's a notification. They're the same for everyone whatever their language,
 * so they hold no text, and how it went has to be looked up too.
 */
function queueNotification(id: number) {
  newIds.add(id);
  newTimer ??= setTimeout(handleNewNotifications, 100);
}

async function handleNewNotifications() {
  newTimer = undefined;
  const ids = newIds;
  newIds = new Set();
  try {
    const res = await fetch("/notifications?status=unread", { headers: { Accept: "application/json" } });
    if (!res.ok) return;
    const notifications = await res.json() as Array<{ notification_id: number, message: string, link: string | null, task: { status: string } | null }>;
    for (const { notification_id, message, link, task } of notifications.reverse()) {
      if (!ids.has(notification_id)) continue;
      if (task?.status === "error") showUnreadErrors();
      if (document.hidden) continue;
      const level = task?.status === "error" ? "error" : task ? "success" : "info";
      notify(message, level, TOAST_TIMEOUT, link ?? undefined);
    }
  } catch (e) {
    //Nothing is lost: a toast is a courtesy, and the next snapshot gets the badge right
    console.warn("Failed to look up a notification:", e);
  }
}


if (streamUrl) {
  const url = streamUrl;
  document.addEventListener("visibilitychange", () => onVisibilityChange(url));
  //An open request would keep the page out of the back/forward cache
  window.addEventListener("pagehide", disconnect);
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) open(url);
  });
  if (document.readyState === "complete") open(url);
  else window.addEventListener("load", () => open(url), { once: true });
}
