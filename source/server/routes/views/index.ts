import { Router, Request, Response } from "express";
import { getHost, getLocals, getUser, getVfs, mapScene, notificationLines, useTemplateProperties } from "../../utils/locals.js";
import { Scene } from "../../vfs/types.js";
import { isUserAtLeast } from "../../auth/User.js";
import designRoutes from "./design.js";
import tagsRoutes from "./tags.js";
import groupsRoutes from "./groups.js";
import scenesRoutes from "./scenes.js";
import adminRoutes from "./admin.js";
import usersRoutes, { requesterRoutes } from "./users.js";
import tasksRoutes from "./tasks.js";

/**
 * The pages of the UI, as /ui/*: those that stand alone here, the others in a file per section
 */
const routes = Router();
/**
 * Set cache-control for ui pages
 */
routes.use("/", (req :Request, res:Response, next)=>{
  res.set("Cache-Control", `no-cache`);
  next();
});

routes.use("/", useTemplateProperties);


routes.get("/", async (req, res)=>{
  const user = getUser(req);
  const vfs = getVfs(req);
  const uid = user?.uid;

  const [rawRecentScenes, rawTags, rawUserOwnedScenes] = await Promise.all([
    vfs.getScenes(uid, {
      limit: 10,
      orderBy: "mtime",
      orderDirection: "desc",
      archived: false,
    }),
    vfs.getTags({limit: 4, user_id: uid ?? null}),
    (user && user.level !== "none") ? vfs.getScenes(uid, {
      limit: 10,
      orderBy: "mtime",
      orderDirection: "desc",
      author: user.username,
      archived: false,
    }) : Promise.resolve([] as Scene[]),
  ]);

  const recentScenes = rawRecentScenes.map(mapScene.bind(null, req));
  const userOwnedScenes = rawUserOwnedScenes.map(mapScene.bind(null, req));

  type CollectionScene = {name: string, thumb: string|null|undefined, uri: string};
  type Collection = {name: string, size: number, scenes: CollectionScene[]};
  const topCollections: Collection[] = [];
  for (const tag of rawTags) {
    const scene_ids = await vfs.getTag(tag.name, uid ?? null);
    const scenes: CollectionScene[] = [];
    for (const id of scene_ids.slice(0, 6)) {
      const scene = mapScene(req, await vfs.getScene(id, uid));
      scenes.push({name: scene.name, uri: `/ui/scenes/${encodeURIComponent(scene.name)}`, thumb: scene.thumb});
    }
    if (scenes.length) topCollections.push({name: tag.name, size: tag.size, scenes});
    if (topCollections.length >= 4) break;
  }

  res.render("home", {
    title: "Home",
    recentScenes,
    topCollections,
    userOwnedScenes,
  });
});

/** Tasks that the upload page starts, and follows: it has their notifications until they've been read */
const UPLOAD_TASKS = ["createSceneFromFiles", "extractScenesArchives"];

/**
 * Where scenes get created, from files that are uploaded first. What that starts is followed as notifications:
 * those of the upload page are there until they've been read, whether they're running or not, wherever they've been read.
 */
routes.get("/upload", async (req, res)=>{
  const {templates}= getLocals(req);
  const requester = getUser(req);
  if(!isUserAtLeast(requester!, "create")){
    return res.status(401).render("error", { 
      error: {
        message: templates.t(requester? "errors.requireCreate": "errors.requireUser", {lng: res.locals.lang, what: "/ui/upload"})
      },
    });
  }
  const items = await getLocals(req).notifications.getNotifications(requester!.uid, { unreadOnly: true, types: UPLOAD_TASKS });
  const uploads = await notificationLines(req, items);
  res.render("upload", {
    title: "eCorpus: Create new scene",
    uploads,
    uploadTasks: UPLOAD_TASKS.join(" "),
  });
})

routes.use("/tags", tagsRoutes);
routes.use("/groups", groupsRoutes);
routes.use("/scenes", scenesRoutes);
routes.use("/admin", adminRoutes);
routes.use("/users", usersRoutes);
routes.use("/user", requesterRoutes);
routes.use("/tasks", tasksRoutes);
routes.use("/design", designRoutes);

routes.get("/standalone", (req, res)=>{
  let host = getHost(req);
  let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);

  res.render("scene/story", {
    layout: "viewer",
    title: `Standalone Story`,
    mode: "Standalone",
    thumb: "/images/sketch_ethesaurus.png",
    referrer: referrer.toString(),
  });
});


export default routes;
