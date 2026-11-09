import { Router } from "express";
import { getHost, getLocals, getTaskScheduler, getUser, getUserManager, getVfs, requireLevel } from "../../utils/locals.js";
import { qsToBool, qsToInt } from "../../utils/query.js";
import { BadRequestError } from "../../utils/errors.js";

/**
 * The instance's administration, as /ui/admin/*: for managers, some pages for admins only
 */
const routes = Router();

routes.use(requireLevel("manage"));
routes.get("/", (req, res)=>{
  const withStatic = qsToBool(req.query.static) ?? false;
  const withDefaults = !(qsToBool(req.query.changes) ?? false);
  const {config} = getLocals(req);

  let configEntries = Array.from(withStatic? config.entries(): config.runtimeEntries());
  if(!withDefaults){
    //locked values are considered defaults for this purpose
    configEntries = configEntries.filter(([_, e])=> !(e as any).locked && (e as any).defaultValue !== (e as any).value);
  }
  res.render("admin/home", {
    layout: "admin",
    title: "Administration",
    withStatic,
    withDefaults,
    config: configEntries,
  });
});

routes.get("/archives", requireLevel("admin"), async (req, res)=>{
  const vfs = getVfs(req);
  const user = getUser(req);
  let scenes = await vfs.getScenes(user?.uid, {archived: true, limit: 100 });
  res.render("admin/archives", {
    layout: "admin",
    title: "Archived scenes — Administration",
    scenes,
  });
});

routes.get("/users", async (req, res)=>{
  const host = getHost(req);
  const userManager = getUserManager(req);
  const limit = qsToInt(req.query.limit) ?? 25;
  const offset = qsToInt(req.query.offset) ?? 0;
  const match = typeof req.query.match === "string" ? req.query.match : undefined;

  const [users, total] = await Promise.all([
    userManager.getUsers(true, {limit, offset, match}),
    userManager.userCount(match),
  ]);

  let pager = {
    from: offset,
    to: offset + users.length,
    total,
    next: undefined as string|undefined,
    previous: undefined as string|undefined,
  };
  if(limit === users.length && offset + users.length < total){
    const nextUrl = new URL(req.originalUrl, host);
    nextUrl.searchParams.set("offset", (offset+limit).toString());
    pager.next = nextUrl.pathname+nextUrl.search;
  }
  if(offset){
    const prevUrl = new URL(req.originalUrl, host);
    prevUrl.searchParams.set("offset", Math.max(0, offset - limit).toString());
    pager.previous = prevUrl.pathname+prevUrl.search;
  }

  res.render("admin/users", {
    layout: "admin",
    title: "Users list — Administration",
    params: {limit, offset, match},
    pager,
    users,
  });
});

routes.get("/oauth", requireLevel("admin"), async (req, res)=>{
  const clients = (await getUserManager(req).getClients()).map(c=>({
    id: c.id,
    name: c.name,
    redirectUris: c.redirectUris,
    confidential: c.confidential,
    created: c.created.toISOString().slice(0, 10),
  }));
  res.render("admin/oauth", {
    layout: "admin",
    title: "OAuth clients — Administration",
    clients,
  });
});

routes.get("/groups", async (req, res)=>{
  let groups = await getUserManager(req).getGroups();
  res.render("admin/groups", {
    layout: "admin",
    title: "Groups — Administration",
    start: 0,
    end: 0 + groups.length,
    total: groups.length,
    groups,
  });
});

routes.get("/stats", requireLevel("admin"),  async (req, res)=>{
  const stats = await getVfs(req).getStats();
  res.render("admin/stats", {
    layout: "admin",
    title: "Instance Statistics — Administration",
    stats,
  });
});

routes.get("/tasks", requireLevel("admin"), async (req, res) => {
  const rawType = typeof req.query.type === 'string' ? req.query.type : undefined;
  const rawStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
  const allowedStatus = ['all', 'success', 'error'];
  const status = allowedStatus.includes(rawStatus ?? '') ? (rawStatus as 'all'|'success'|'error') : 'all';
  if (rawStatus && status !== rawStatus) throw new BadRequestError(`Invalid status requested : ${rawStatus}`);
  const limit = qsToInt(req.query.limit) ?? 20;
  const offset = qsToInt(req.query.offset) ?? 0;
  let type: string | undefined;
  if (rawType) {
    if (rawType.length > 200) throw new BadRequestError("type parameter too long");
    type = rawType;
  }
  const tasks = await getTaskScheduler(req).getTaskTrees({ user_id: undefined, type, status, limit, offset });
  res.render("admin/tasks", {
    layout: "admin",
    title: "Tasks — Administration",
    tasks,
    params: { type, status, limit, offset },
  });
});

export default routes;
