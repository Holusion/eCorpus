import { i18n } from "../utils/i18n.js";
import { NotificationItem } from "./types.js";

/** "running": its task hasn't settled, it will notify. "unread": it has, or never had a task. */
export type ItemState = "running" | "unread" | "read";

/** The same as the browser's (source/ui/state/notifications.ts) */
export function stateOf({status, read}: NotificationItem): ItemState{
  if(status !== null && status !== "success" && status !== "error") return "running";
  return read ? "read" : "unread";
}

/** A message, rather than a set of them */
function isMessage(key: string, lng: string): boolean{
  return i18n.exists(key, {lng}) && typeof i18n.t(key, {lng, returnObjects: true}) === "string";
}

/**
 * What a notification says, in a language: the same as the browser makes of `notifications.messages`
 * (see source/ui/activity/panel.ts). The type of a task shows when there's nothing more specific.
 * Without a task, it tells its type. Pages that read its `data` (see `NotificationManager.getData`) can tell more:
 * from `notifications.details`, by type then by access level if there's one (see `AccessNotificationData`).
 */
export function messageOf(item: NotificationItem, lng: string, data?: Record<string, unknown>): string{
  if(item.task_id === null){
    const access = data?.access;
    const keys = [
      ...(data && typeof access === "string" ? [`notifications.details.${item.type}.${access}`] : []),
      ...(data ? [`notifications.details.${item.type}`] : []),
      `notifications.messages.${item.type}`,
    ];
    const key = keys.find(k=> isMessage(k, lng)) ?? "notifications.messages.default";
    return i18n.t(key, {...data, type: item.type, lng});
  }
  const state = stateOf(item) === "running" ? "running" : item.status;
  const keys = [`notifications.messages.task.${item.type}.${state}`, `notifications.messages.task.default.${state}`];
  const key = keys.find(k=> i18n.exists(k, {lng})) ?? keys[keys.length - 1];
  return i18n.t(key, {lng, type: item.type});
}

/**
 * Where a notification leads to: its task, or wherever the server finds it's about when it's followed
 * (see routes/views/users.ts). The same as the browser's (source/ui/activity/panel.ts)
 */
export function linkOf(item: NotificationItem): string{
  return item.task_id === null ? `/ui/user/notifications/${item.notification_id}` : `/ui/tasks/${item.task_id}`;
}

/**
 * How a notification shows in a page: a line of partials/notification.hbs, without what came out of it (see outcomes.ts).
 * The bell's panel draws them the same way, without their `data`: see source/ui/activity/panel.ts
 */
export function notificationView(item: NotificationItem, lng: string, data?: Record<string, unknown>){
  const state = stateOf(item);
  //Still running: the cube, see partials/notification.hbs
  const [icon, iconClass] = state === "running" ? ["", ""]
    : item.status === "error" ? ["error", "text-error"]
    : item.status === "success" ? ["check", "text-success"]
    : ["info", "text-info"];
  return {
    notification_id: item.notification_id,
    state,
    message: messageOf(item, lng, data),
    link: linkOf(item),
    icon,
    iconClass,
    mtime: item.mtime,
  };
}
