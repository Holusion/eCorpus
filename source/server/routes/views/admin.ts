import { Router } from "express";
import wrap from "../../utils/wrapAsync.js";
import { isManage, isAdministrator, getVfs, getUser, getUserManager, getLocals } from "../../utils/locals.js";
import { queryToPage } from "../../utils/query.js";
import { RootTasksTreeNode } from "../../tasks/scheduler.js";

const router = Router();

router.use("/", isManage);
router.get("/", (req, res)=>{
  res.render("admin/home", {
    layout: "admin",
    title: "eCorpus Administration",
  });
});

router.get("/archives", isAdministrator, wrap(async (req, res)=>{
  const vfs = getVfs(req);
  const user = getUser(req);
  let scenes = await vfs.getScenes(user?.uid, {archived: true, limit: 100 });
  res.render("admin/archives", {
    layout: "admin",
    title: "eCorpus Administration: Archived scenes",
    scenes,
  });
}));

router.get("/users", wrap(async (req, res)=>{
  let users = await getUserManager(req).getUsers();
  res.render("admin/users", {
    layout: "admin",
    title: "eCorpus Administration: Users list",
    start: 0,
    end: 0 + users.length,
    total: users.length,
    users,
  });
}));

router.get("/groups", wrap(async (req, res)=>{
  let groups = await getUserManager(req).getGroups();
  res.render("admin/groups", {
    layout: "admin",
    title: "eCorpus Administration: Groups",
    start: 0,
    end: 0 + groups.length,
    total: groups.length,
    groups,
  });
}));

router.get("/stats", isAdministrator,  wrap(async (req, res)=>{
  const stats = await getVfs(req).getStats();
  res.render("admin/stats", {
    layout: "admin",
    title: "eCorpus Administration: Instance Statistics",
    stats,
  });
}));

router.get("/tasks", wrap(async (req, res)=>{
  const {taskScheduler} = getLocals(req);
  let params = queryToPage(req.query);

  const tasks = await taskScheduler.getTasks(params);

  console.log("Tasks : ", JSON.stringify(tasks, null, 2));
  res.render("admin/tasks", {
    layout: "admin",
    title: "eCorpus Administration: Tasks",
    tasks,
  });
}));

export default router;