import { Router, Request, RequestHandler } from "express";
import { getHost, getLocals, getTaskScheduler, getUser, getUserManager, getVfs, notificationLines, numericParam, parseTaskListQuery, policy } from "../../utils/locals.js";
import { qsToBool, qsToInt, qsToIntArray } from "../../utils/query.js";
import { isUserAtLeast } from "../../auth/User.js";
import { SCOPE_LADDER, TOKEN_SCOPES } from "../../auth/Token.js";
import { BadRequestError, UnauthorizedError } from "../../utils/errors.js";
import { NotificationManager } from "../../notifications/manager.js";

/**
 * The pages of users' accounts, as /ui/users/*
 */
const routes = Router();

/**
 * The requester's own, as /ui/user/*: what isn't one of their pages, and where their pages used to be
 */
export const requesterRoutes = Router();

/** Who isn't logged in logs in, to come back here */
const loggedIn: RequestHandler = (req, res, next)=>{
  if(isUserAtLeast(getUser(req), "use")) return next();
  res.redirect(302, `/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
};

/**
 * The pages of a user's account, under `/ui/users/:uid/`: the user's own, and any user's for an admin,
 * who sees them as the user does (see policy({on: "user"})). One link to them is good for whoever may follow it.
 */
const userPagePolicy = [numericParam("uid"), loggedIn, policy({ access: "read", on: "user" })];

/** Whose pages these are, and whether they're the requester's own: the layout names the user when they aren't (see layouts/user.hbs) */
async function userPage(req: Request){
  const requester = getUser(req)!;
  const uid = parseInt(req.params.uid, 10);
  const isSelf = uid === requester.uid;
  const {username, email, level} = isSelf ? requester : await getUserManager(req).getUserById(uid);
  return {
    layout: "user",
    account: {uid, username, email, level},
    isSelf,
    /** A page's title: "<page> — User" for one's own, "<page> — <username>" for someone else's */
    title: (page: string)=> `${page} — ${isSelf ? "User" : username}`,
  };
}

routes.get("/:uid", ...userPagePolicy, async (req, res)=>{
  const {title, ...page} = await userPage(req);
  res.render("user/settings", {
    ...page,
    title: page.isSelf ? "User Settings" : title("Settings"),
  });
});

routes.get("/:uid/groups", ...userPagePolicy, async (req, res)=>{
  const {title, ...page} = await userPage(req);
  const groups = await getUserManager(req).getGroupsOfUser(page.account.uid);
  res.render("user/groups", {
    ...page,
    title: title("Group Settings"),
    groups
  });
});

/**
 * The scope families offered by the token-mint UI, in display order: every
 * family with at least one mintable scope. Rungs are derived from
 * {@link TOKEN_SCOPES}, so non-mintable scopes (`users:admin`,
 * `account:admin`, `instance:write`) never show up.
 */
const TOKEN_UI_FAMILIES = ["corpus", "scenes", "history", "tasks", "users", "groups", "instance", "account"];

/** What a fresh token-mint form starts with: a minimal read-only token */
const TOKEN_UI_DEFAULT_SCOPES = ["corpus:read", "scenes:read"];

/**
 * A user's tokens. Only users make their own tokens and see the apps they've let in:
 * an admin sees the tokens of others to revoke them, through the API's /users/:uid/tokens.
 */
routes.get("/:uid/tokens", ...userPagePolicy, async (req, res)=>{
  const {title, ...page} = await userPage(req);
  //Both token classes are shown by default. An unchecked checkbox submits
  //nothing, so absence alone can't mean "hide": the form carries a hidden
  //`filter` marker to distinguish a submission from a plain navigation.
  const filtered = "filter" in req.query;
  const showPersonal = qsToBool(req.query.personal) ?? !filtered;
  const showOauth = qsToBool(req.query.oauth) ?? !filtered;
  const tokens = (await getUserManager(req).getTokens(page.account.uid))
    .filter((t)=> t.clientName ? showOauth : showPersonal);
  //Every family renders all three ladder slots so the columns stay aligned;
  //non-mintable levels are flagged and drawn as inert hatched slots.
  const scopeFamilies = TOKEN_UI_FAMILIES.map((family)=>{
    const rungs = SCOPE_LADDER.map((level)=>{
      const scope = `${family}:${level}`;
      return {
        level,
        short: level[0],
        scope,
        available: TOKEN_SCOPES.includes(scope),
        checked: TOKEN_UI_DEFAULT_SCOPES.includes(scope),
      };
    });
    //Families with no default selection rest at the "no access" origin
    return {family, rungs, defaulted: rungs.some((r)=>r.checked)};
  });
  res.render("user/tokens", {
    ...page,
    title: title("API Tokens"),
    scopeFamilies,
    tokens,
    showPersonal,
    showOauth,
  });
});

routes.get("/:uid/archives", ...userPagePolicy, async (req, res)=>{
  const {title, ...page} = await userPage(req);
  //What the requester may see of them: an admin sees them all
  const archives = await getVfs(req).getScenes(getUser(req)!.uid, {archived: true, author: page.account.username});
  res.render("user/archives", {
    ...page,
    title: title("Archives"),
    archives,
  });
});

routes.get("/:uid/tasks", ...userPagePolicy, async (req, res) => {
  const {title, ...page} = await userPage(req);
  const { type, status, limit, offset } = parseTaskListQuery(req);
  const [tasks, types] = await Promise.all([
    getTaskScheduler(req).getTaskTrees({ user_id: page.account.uid, type, status, limit, offset }),
    getTaskScheduler(req).getTaskTypes({ user_id: page.account.uid }),
  ]);
  res.render("user/tasks", {
    ...page,
    title: page.isSelf ? "My Tasks — User" : title("Tasks"),
    tasks,
    types,
    params: { type, status, limit, offset },
  });
});

/**
 * All of a user's notifications, read or not, a page at a time. Where small screens get from the bell:
 * they don't have the room for its panel.
 * Only for the user: they're theirs to read, and reading them here would mark them read for them.
 */
routes.get("/:uid/notifications", ...userPagePolicy, async (req, res) => {
  const {title, ...page} = await userPage(req);
  if(!page.isSelf) throw new UnauthorizedError(`Only a user may read their notifications`);
  const unreadOnly = qsToBool(req.query.unread) ?? false;
  const limit = NotificationManager.notificationsLimit(qsToInt(req.query.limit));
  const offset = qsToInt(req.query.offset) ?? 0;
  //One more, to tell whether there's a next page
  const items = await getLocals(req).notifications.getNotifications(page.account.uid, { limit: limit + 1, offset, unreadOnly });
  const notifications = await notificationLines(req, items.slice(0, limit));

  const pageUrl = (offset: number) => {
    const url = new URL(req.originalUrl, getHost(req));
    url.searchParams.set("offset", offset.toString());
    return url.pathname + url.search;
  };
  const next = limit < items.length ? pageUrl(offset + limit) : undefined;
  const previous = offset ? pageUrl(Math.max(0, offset - limit)) : undefined;
  res.render("user/notifications", {
    ...page,
    title: title("Notifications"),
    notifications,
    unread: notifications.some((n) => n.state === "unread"),
    params: { unreadOnly },
    pager: (next || previous) ? { from: offset, to: offset + notifications.length, next, previous } : undefined,
  });
});


/**
 * Lines of some of the user's notifications, as pages draw them: by id, or by the task they're about (`?id=…&task=…`).
 * For those pages to draw again what has changed, or to add what's new: see source/ui/activity/page.ts.
 * Those that aren't the user's are left out.
 * Not one of the user's pages: a part of any page that shows the requester's notifications, as the upload page does.
 */
requesterRoutes.get("/notifications/lines", async (req, res) => {
  const user = getUser(req);
  if (!isUserAtLeast(user, "use")) throw new UnauthorizedError();
  const ids = qsToIntArray(req.query.id);
  const task_ids = qsToIntArray(req.query.task);
  //At most one per id, and one per task
  const limit = ids.length + task_ids.length;
  if(100 < limit) throw new BadRequestError(`At most 100 ids and tasks at once`);
  const items = limit ? await getLocals(req).notifications.getNotifications(user!.uid, { ids, task_ids, limit }) : [];
  res.render("user/notificationLines", { layout: null, lines: await notificationLines(req, items) });
});

/**
 * Where a user's own pages used to be: `/ui/user/…` is `/ui/users/<their uid>/…`, for links and bookmarks made before
 */
requesterRoutes.get(/.*/, (req, res)=>{
  const user = getUser(req);
  if(!isUserAtLeast(user, "use")) return res.redirect(302, `/auth/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  const url = new URL(req.originalUrl, getHost(req));
  url.pathname = url.pathname.replace(/^\/ui\/user\/?/, `/ui/users/${user!.uid}/`);
  res.redirect(302, url.pathname + url.search);
});

export default routes;
