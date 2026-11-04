/**
 * The count of unread notifications in the navbar. Its color tells if any of them are about a failure.
 * How the count gets displayed is up to the styles.
 *
 * It's all kept in the element, as this is shared by separate bundles that each get a copy of this module.
 */

function badge() {
  return document.querySelector<HTMLElement>("#nav-notifications .nav-badge");
}

export function showUnreadErrors() {
  const el = badge();
  if (el) el.dataset.level = "error";
}

export function setUnread(count: number, hasErrors?: boolean) {
  const el = badge();
  if (!el) return;
  const value = Math.max(0, count);
  el.dataset.count = value.toString();
  el.setAttribute("aria-label", value.toString());
  el.hidden = value === 0;
  if (hasErrors !== undefined) el.dataset.level = hasErrors ? "error" : "success";
}

export function addUnread(delta: number) {
  setUnread(parseInt(badge()?.dataset.count ?? "0", 10) + delta);
}
