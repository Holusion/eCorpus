import { i18n } from "../utils/i18n.js";
import { NotificationItem } from "./types.js";

/** "running": its task hasn't settled, it will notify. "unread": it has, or never had a task. */
export type ItemState = "running" | "unread" | "read";

/** The same as the browser's (source/ui/state/notifications.ts) */
export function stateOf({status, read}: NotificationItem): ItemState{
  if(status !== null && status !== "success" && status !== "error") return "running";
  return read ? "read" : "unread";
}

/**
 * What a notification says, in a language: the same as the browser makes of `notifications.messages`
 * (see source/ui/activity/panel.ts). The type of a task shows when there's nothing more specific.
 */
export function messageOf(item: NotificationItem, lng: string): string{
  if(item.task_id === null) return i18n.t("notifications.messages.default", {lng});
  const state = stateOf(item) === "running" ? "running" : item.status;
  const keys = [`notifications.messages.task.${item.type}.${state}`, `notifications.messages.task.default.${state}`];
  const key = keys.find(k=> i18n.exists(k, {lng})) ?? keys[keys.length - 1];
  return i18n.t(key, {lng, type: item.type});
}
