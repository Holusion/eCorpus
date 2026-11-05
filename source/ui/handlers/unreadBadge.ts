/**
 * The count of unread notifications in the navbar. Its color tells if any of them are about a failure.
 * How the count gets displayed is up to the styles.
 *
 * It's all kept in the element, as this is shared by separate bundles that each get a copy of this module.
 *
 * It's saved for the next page in this tab to show right away, until its stream connects.
 * The script that does that has to run before anything gets painted: it's next to the badge in navbar.hbs.
 */

function badge() {
  return document.querySelector<HTMLElement>("#nav-notifications .nav-badge");
}

/** Whether this page is showing what a previous page has saved. Only meant for when it has just loaded. */
export function hasSavedUnread() {
  return badge()?.dataset.count !== undefined;
}

/** To be called when what the badge shows is known to be right */
export function saveUnread() {
  const el = badge();
  const count = el?.dataset.count;
  if (!el || !count) return;
  const { user, level } = el.dataset;
  try {
    sessionStorage.setItem("unread-notifications", JSON.stringify({ user, at: Date.now(), count: parseInt(count, 10), level }));
  } catch (e) {
    //Nothing depends on it: the next page will show the count once it knows
  }
}

export function showUnreadErrors() {
  const el = badge();
  if (el) {
    el.dataset.level = "error";
    saveUnread();
  }
}

export function setUnread(count: number, hasErrors?: boolean) {
  const el = badge();
  if (!el) return;
  const value = Math.max(0, count);
  el.dataset.count = value.toString();
  el.setAttribute("aria-label", value.toString());
  el.hidden = value === 0;
  if (hasErrors !== undefined) el.dataset.level = hasErrors ? "error" : "success";
  saveUnread();
}

export function addUnread(delta: number) {
  setUnread(parseInt(badge()?.dataset.count ?? "0", 10) + delta);
}
