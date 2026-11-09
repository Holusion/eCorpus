/**
 * The panel that opens from the bell in the navbar: what's running, and what's new. What's been read leaves it.
 * What's new is cut in a few spans of time, each under a line that tells how old it is: lines have the room for their title.
 * It's a native popover, so this has nothing to do with opening or closing it.
 * It's drawn from what the stream has told, with no request of its own.
 */
import { NotificationItem, stateOf } from "../state/notifications";
import { getStatus, isLoaded, itemsIn } from "./state";
import { followsLink, markAsRead } from "./markRead";

type Messages = {
  default?: string;
  task?: Record<string, Partial<Record<"running" | "success" | "error", string>>>;
};

//What's shorter than the last of those is "now"
const AGE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** Where the list is cut, in seconds, from the most recent: what's more recent than the first is "just now" */
const SINCE = [3600, 2 * 3600, 4 * 3600, 8 * 3600, 24 * 3600, 7 * 24 * 3600];

const lang = document.documentElement.lang || undefined;
/** Each line's own, for those who can't see where it is */
const ageFormat = new Intl.RelativeTimeFormat(lang, { style: "long", numeric: "auto" });
/** Each line's own, on hover: where it is tells how old it is already */
const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" });
/** Between lines: "1 day ago" rather than "yesterday", which is something else */
const sinceFormat = new Intl.RelativeTimeFormat(lang, { style: "short", numeric: "always" });

const panel = document.querySelector<HTMLElement>("#nav-notifications-panel");
const list = panel?.querySelector<HTMLElement>("ul");
const loading = panel?.querySelector<HTMLElement>(".nav-notifications-loading");
const empty = panel?.querySelector<HTMLElement>(".nav-notifications-empty");
const offline = panel?.querySelector<HTMLElement>(".nav-notifications-offline");
const markAll = panel?.querySelector<HTMLButtonElement>(".nav-notifications-mark-all");
/** How long a line takes to leave. It can't be clicked meanwhile: what took its place can. */
const LEAVE_DURATION = 200;

let messages: Messages = {};
try {
  messages = JSON.parse(panel?.dataset.messages ?? "{}");
} catch (e) {
  console.warn("Invalid notification messages:", e);
}

/** In the page's language, which the server has rendered them in. The type of a task shows when there's nothing more specific. */
export function messageOf(item: NotificationItem): string {
  if (item.task_id === null) return messages.default ?? item.type;
  const state = stateOf(item) === "running" ? "running" : item.status as "success" | "error";
  const message = messages.task?.[item.type]?.[state] ?? messages.task?.default?.[state] ?? `${item.type}: ${item.status}`;
  return message.replace(/\{\{\s*type\s*\}\}/g, item.type);
}

/** Where a notification leads to, if anywhere */
export function linkOf(item: NotificationItem): string | null {
  return item.task_id === null ? null : `/ui/tasks/${item.task_id}`;
}

/** Tells at a glance how things went, as titles may be cut before they get to it */
function statusIcon(item: NotificationItem) {
  const icon = document.createElement("ui-icon");
  const [name, color] = stateOf(item) === "running" ? ["loader", "nav-notifications-running"]
    : item.status === "error" ? ["error", "text-error"]
    : item.status === "success" ? ["check", "text-success"]
    : ["info", "text-info"];
  icon.className = color;
  icon.setAttribute("name", name);
  return icon;
}

/** In seconds, since it last changed. NaN if that can't be told. */
function ageOf(item: NotificationItem) {
  //Clocks don't always agree: nothing here is about the future
  return Math.max(0, (Date.now() - Date.parse(item.mtime)) / 1000);
}

/** Approximate: it's only there to tell what's recent */
function inUnits(seconds: number): [number, Intl.RelativeTimeFormatUnit] {
  const [unit, size] = AGE_UNITS.find(([, size]) => size <= seconds) ?? ["second", 0];
  return [size ? -Math.floor(seconds / size) : 0, unit];
}

/** What follows is older than that: one of SINCE, or 0 for what's newest */
function since(seconds: number) {
  const li = document.createElement("li");
  li.className = "nav-notifications-since";
  //Each line tells its own age to those who can't see this one
  li.setAttribute("aria-hidden", "true");
  li.textContent = seconds ? sinceFormat.format(...inUnits(seconds)) : panel!.dataset.justNow || ageFormat.format(0, "second");
  return li;
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

function renderItem(item: NotificationItem) {
  const li = document.createElement("li");
  const state = stateOf(item);
  li.dataset.notificationId = item.notification_id.toString();
  li.className = state;
  const link = linkOf(item);
  const title = document.createElement(link ? "a" : "div");
  if (link) title.setAttribute("href", link);
  const message = messageOf(item);
  const text = document.createElement("span");
  text.textContent = message;
  title.append(statusIcon(item), text);
  const age = ageOf(item);
  //It may get cut
  title.title = message;
  if (Number.isFinite(age)) {
    const time = document.createElement("time");
    time.className = "visually-hidden";
    time.dateTime = item.mtime;
    time.textContent = ageFormat.format(...inUnits(age));
    title.appendChild(time);
    title.title += `\n${dateFormat.format(Date.parse(item.mtime))}`;
  }
  li.appendChild(title);
  //The UI only marks what has settled. The others leave its column empty: see activity.scss
  if (state === "unread") li.appendChild(markButton());
  return li;
}

/** The notifications' lines, without what's between them */
function lines() {
  return list!.querySelectorAll<HTMLElement>(":scope > li[data-notification-id]");
}

/**
 * Runs something that may remove what has the focus, which would close the list on someone using a keyboard.
 * Focus goes to the line that takes its place: going through them one by one works the same as with a mouse.
 */
function keepingFocus(change: () => void) {
  const focused = document.activeElement as HTMLElement | null;
  const hadFocus = panel!.contains(focused);
  const index = Array.prototype.indexOf.call(lines(), focused?.closest("li"));
  const onButton = !!focused?.matches("li > .btn");
  change();
  if (!hadFocus || panel!.contains(document.activeElement)) return;
  const after = lines();
  const line = index < 0 ? null : after[index] ?? after[after.length - 1];
  const target = (onButton && line?.querySelector<HTMLElement>(".btn")) || line?.querySelector<HTMLElement>("a, .btn");
  (target ?? (markAll!.hidden ? document.querySelector<HTMLElement>("#nav-notifications")! : markAll!)).focus();
}

/**
 * Lines that are gone get wiped away, over what has taken their place: they're out of the list already,
 * so that clicking again where they were gets to the next one.
 */
function leave(lines: Map<string, { li: HTMLElement, rect: DOMRect }>) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const origin = panel!.getBoundingClientRect();
  const visible = list!.parentElement!.getBoundingClientRect();
  for (const [id, { li, rect }] of lines) {
    //Still there, or scrolled out of sight
    if (list!.querySelector(`li[data-notification-id="${id}"]`) || rect.bottom <= visible.top || visible.bottom <= rect.top) continue;
    li.classList.add("leaving");
    li.inert = true;
    Object.assign(li.style, {
      top: `${rect.top - origin.top - panel!.clientTop}px`,
      left: `${rect.left - origin.left - panel!.clientLeft}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    panel!.appendChild(li);
    const done = () => li.remove();
    li.animate([
      { clipPath: "inset(0 0 0 0)", opacity: 1 },
      { clipPath: "inset(0 0 0 100%)", opacity: 0 },
    ], { duration: LEAVE_DURATION, easing: "ease-in" }).finished.then(done, done);
  }
}

/** What's new, newest first, each span of time under a line that tells it. Those with nothing in them don't show. */
function renderUnread(items: NotificationItem[]) {
  const rendered: HTMLElement[] = [];
  let span = -1;
  for (const item of items) {
    //Only ever further down, should one be out of order
    const next = SINCE.filter((s) => s <= ageOf(item)).length;
    if (span < next) rendered.push(since(next ? SINCE[next - 1] : 0));
    span = Math.max(span, next);
    rendered.push(renderItem(item));
  }
  return rendered;
}

/**
 * What's running first: that's what someone opening it right after starting a task looks for. It needs no age.
 * Not being live only adds a line under it: what was received until then is still there to see.
 * @param animate whether lines that are gone should be seen leaving
 */
function render(animate = false) {
  const status = getStatus();
  //Not started yet, as the page has it, is loading too
  loading!.hidden = status === "live" || status === "offline";
  offline!.hidden = status !== "offline";
  if (loading!.hidden) list!.removeAttribute("aria-busy");
  else list!.setAttribute("aria-busy", "true");
  const running = itemsIn("running");
  const unread = itemsIn("unread");
  const previous = new Map<string, { li: HTMLElement, rect: DOMRect }>();
  if (animate) {
    //Lines between spans of time just go: what's left around them is enough to tell
    for (const li of lines()) {
      previous.set(li.dataset.notificationId!, { li, rect: li.getBoundingClientRect() });
    }
  }
  keepingFocus(() => {
    list!.replaceChildren(...running.map(renderItem), ...renderUnread(unread));
    //Nothing's known yet: that isn't an empty list
    empty!.hidden = !isLoaded() || running.length + unread.length !== 0;
    markAll!.hidden = unread.length === 0;
  });
  if (animate) leave(previous);
}

if (panel && list && loading && empty && offline && markAll) {
  document.addEventListener("activity-change", () => {
    //Ages, and where the list is cut, are only updated when it opens: it's not worth redrawing for while it's closed
    if (panel.matches(":popover-open")) render(true);
  });
  panel.addEventListener("beforetoggle", (e) => {
    if ((e as ToggleEvent).newState === "open") render();
  });

  const onActivate = (e: Event) => {
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>("li.unread");
    if (!item || !followsLink(e) || !target.closest("a, button")) return;
    markAsRead([parseInt(item.dataset.notificationId!, 10)]);
  };
  list.addEventListener("click", onActivate);
  //Middle click: the link opens in another tab
  list.addEventListener("auxclick", onActivate);

  //What's marked is what's been shown: not something that came in since
  markAll.addEventListener("click", () => markAsRead(itemsIn("unread").map((n) => n.notification_id)));
}
