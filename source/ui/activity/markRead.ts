/**
 * Marking notifications as read. It shows right away: the server's own signal confirms it later,
 * and gets it to the user's other tabs.
 */
import { toast } from "../state/toast";
import { setRead } from "./state";

function activityUrl() {
  return document.querySelector<HTMLElement>("#nav-notifications")?.dataset.activity;
}

/** keepalive: it may have to outlive the page, when following a link */
export async function markAsRead(ids: number[]): Promise<void> {
  const url = activityUrl();
  const changes = setRead(ids);
  if (!url || !changes.length) return;
  try {
    const res = await fetch(`${url}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: changes }),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`);
  } catch (e) {
    setRead(changes, false);
    console.error("Failed to mark notifications as read:", e);
    const message = document.querySelector<HTMLElement>("#nav-notifications-panel")?.dataset.markFailed;
    toast(message ?? "Error", "error", 5000);
  }
}

/** Whether a click opens the link it's on: a right click also counts as an "auxclick", but it only opens a menu */
export function followsLink(e: Event) {
  return e.type === "click" || (e as MouseEvent).button === 1;
}
