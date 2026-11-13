/**
 * Marking notifications as read. It shows right away: the server's own signal confirms it later,
 * and gets it to the user's other tabs.
 */
import { toast } from "../state/toast";
import { getItem, setRead } from "./state";

function activityUrl() {
  return document.querySelector<HTMLElement>("#nav-notifications")?.dataset.activity;
}

/**
 * Those the stream has told about show it right away. Others, that only a page has (see page.ts), are sent as well:
 * that page shows it by itself.
 * keepalive: it may have to outlive the page, when following a link.
 * @returns whether it worked. It's been told already if it didn't.
 */
export async function markAsRead(ids: number[]): Promise<boolean> {
  const url = activityUrl();
  const changes = setRead(ids);
  const sent = [...changes, ...ids.filter((id) => !getItem(id))];
  if (!url || !sent.length) return true;
  try {
    const res = await fetch(`${url}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: sent }),
      keepalive: true,
    });
    if (!res.ok) throw new Error(`[${res.status}] ${res.statusText}`);
    return true;
  } catch (e) {
    setRead(changes, false);
    console.error("Failed to mark notifications as read:", e);
    const message = document.querySelector<HTMLElement>("#nav-notifications-panel")?.dataset.markFailed;
    toast(message ?? "Error", "error", 5000);
    return false;
  }
}

/** Whether a click opens the link it's on: a right click also counts as an "auxclick", but it only opens a menu */
export function followsLink(e: Event) {
  return e.type === "click" || (e as MouseEvent).button === 1;
}
