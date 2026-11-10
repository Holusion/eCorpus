import { Router } from "express";
import { getLanguage, getSession, getUser, getVfs, requireLevel } from "../../utils/locals.js";
import { qsToBool, qsToInt } from "../../utils/query.js";
import { i18n, localize } from "../../utils/i18n.js";
import { TaskStatus } from "../../tasks/types.js";
import { notificationView } from "../../notifications/messages.js";
import type { UploadLine } from "./index.js";

/**
 * Pages to see what the UI is made of: components, embeds and emails, as /ui/design/*
 */
const routes = Router();
routes.use(requireLevel("manage"));

/**
 * Lines of notifications as pages draw them, for the design page: made up, not anyone's.
 * Their links go nowhere: their tasks and scenes don't exist.
 */
function demoNotifications(lng: string){
  const now = Date.now();
  const line = (notification_id: number, type: string, status: TaskStatus, {read = false, minutes = 0} = {}, extra: Partial<UploadLine> = {}): UploadLine => ({
    ...notificationView({notification_id, task_id: notification_id, type, status, read, mtime: new Date(now - minutes * 60_000).toISOString()}, lng),
    link: "#",
    scenes: [],
    ...extra,
  });
  const part = (name: string, action: "created"|"updated"): Partial<UploadLine> => ({
    part: "scene",
    message: name,
    link: "#",
    action: i18n.t(`notifications.upload.${action}`, {lng}),
    tools: {name, editable: true},
  });
  //A block for each kind of line
  return [
    {label: "running", lines: [line(1, "createSceneFromFiles", "running")]},
    {label: "success: unread", lines: [line(2, "createSceneFromFiles", "success", {minutes: 5})]},
    {label: "failed: unread", lines: [line(3, "extractScenesArchives", "error", {minutes: 90})]},
    {label: "read", lines: [line(4, "createSceneFromFiles", "success", {read: true, minutes: 3 * 24 * 60})]},
    {label: "upload page: a scene, why it failed, an archive and its scenes", lines: [
      line(6, "createSceneFromFiles", "success", {minutes: 2}, {scenes: [{name: "my-scene", editable: true}]}),
      line(7, "createSceneFromFiles", "error", {minutes: 10}, {detail: localize("errors.sceneExists", {name: "my-scene"}).translate(lng)}),
      line(8, "extractScenesArchives", "success", {minutes: 30}),
      line(8, "extractScenesArchives", "success", {minutes: 30}, part("seclin-fontaine", "created")),
      line(8, "extractScenesArchives", "success", {minutes: 30}, part("seclin-voie-romaine", "updated")),
    ]},
  ];
}

routes.get("/", (req, res)=>{
  res.render("design/components", {
    layout: "design",
    title: "UI components",
    demoNotifications: demoNotifications(getLanguage(req)),
  });
});

routes.get("/embeds", async (req, res)=>{
  const vfs = getVfs(req);
  const requester = getUser(req);
  const queryTag = typeof req.query.tag === "string" ? req.query.tag.trim() : "";
  const queryScene = typeof req.query.scene === "string" ? req.query.scene.trim() : "";
  const match = typeof req.query.match === "string" ? req.query.match.trim() : "";
  const target = req.query.target === "tags" ? "tags"
    : req.query.target === "scene" ? "scene"
    : "tag";
  const limit = qsToInt(req.query.limit);
  const offset = qsToInt(req.query.offset);
  const isTag = target === "tag";
  const isTags = target === "tags";
  const isScene = target === "scene";
  // A scene-mode submit always carries the `scene` field (it's `required`),
  // so its presence distinguishes an explicit submit from a freshly switched
  // dropdown — in the latter case we want sensible defaults (both allowed).
  const sceneSubmitted = isScene && typeof req.query.scene === "string";
  const fullscreen = sceneSubmitted ? !!qsToBool(req.query.fullscreen) : true;
  let tag = queryTag;
  let scene = queryScene;
  if(isTag && !tag){
    const [first] = await vfs.getTags({limit: 1});
    tag = first?.name ?? "";
  }
  if(isScene && !scene){
    const [first] = await vfs.getScenes(requester?.uid, {limit: 1});
    scene = first?.name ?? "";
  }
  let iframePath = "";
  let allowParts = ["fullscreen", "xr", "xr-spatial-tracking", "accelerometer", "gyroscope"];
  let showPreview = false;
  if(isTag){
    if(tag){
      iframePath = `ui/tags/${encodeURIComponent(tag)}?embed=1`;
      showPreview = true;
    }
  } else if(isScene){
    if(scene){
      iframePath = `ui/scenes/${encodeURIComponent(scene)}/view`;
      showPreview = true;
      allowParts = ["xr", "xr-spatial-tracking"];
      if(fullscreen) allowParts.push("fullscreen");
    }
  } else {
    const params = new URLSearchParams({embed: "1"});
    if(match) params.set("match", match);
    if(typeof limit === "number") params.set("limit", String(limit));
    if(typeof offset === "number") params.set("offset", String(offset));
    iframePath = `ui/tags?${params.toString()}`;
    showPreview = true;
  }
  res.render("design/embeds", {
    layout: "design",
    title: "Embed previews",
    tag,
    scene,
    match,
    limit,
    offset,
    target,
    isTag,
    isTags,
    isScene,
    iframePath,
    showPreview,
    allow: allowParts.join("; "),
    fullscreen,
  });
});

routes.get("/emails", async (req, res)=>{
  const allowedLangs = ["en", "fr"] as const;
  // Use a dedicated query param (not `lang`) — `lang` is the UI locale
  // controlled by the footer language switcher, and conflating the two
  // means changing the previewed template language also flips the
  // surrounding page's chrome (and vice-versa).
  const qLang = typeof req.query.mailLang === "string" ? req.query.mailLang : "";
  const mailLang = (allowedLangs as readonly string[]).includes(qLang) ? qLang : (getSession(req)?.lang ?? "en");
  const qUser = typeof req.query.username === "string" ? req.query.username.trim() : "";
  const username = qUser || getUser(req)?.username || "user";
  res.render("design/emails", {
    layout: "design",
    title: "Email template previews",
    previewLang: mailLang,
    previewUsername: username,
    templates: ["connection", "onboarding"],
  });
});

export default routes;
