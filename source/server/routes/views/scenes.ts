import { Router } from "express";
import { getHost, getSession, getTaskListPager, getTaskScheduler, getUser, getUserManager, getVfs, mapScene, parseTaskListQuery, policy } from "../../utils/locals.js";
import ScenesVfs from "../../vfs/Scenes.js";
import { qsToBool, qsToInt } from "../../utils/query.js";
import { AccessLevel } from "../../auth/UserManager.js";
import { aggregateHistory } from "./historyAggregate.js";

/**
 * Searching scenes, and the pages of a scene, as /ui/scenes/*
 */
const routes = Router();

routes.get("/", async (req, res)=>{
  let host = getHost(req);
  let vfs = getVfs(req);
  let u = getUser(req);
  //pre-parse query to make sure we don't pass unsatinized input to the template
  let {
    match,
    access,
    limit,
    offset,
    orderBy,
    orderDirection,
    archived,
    author,
    type,
  } = req.query;

  if ((! access )|| access == "none"){
    access = undefined;
  }
  const sceneParams = {
    match: match as string,
    orderBy: (orderBy ?? (match ? "rank" : "mtime")) as any,
    orderDirection: (orderDirection?? (orderBy=="name"?"asc":"desc")) as any,
    access: access as any,
    limit: qsToInt(limit) ?? 25,
    offset: qsToInt(offset)?? 0,
    archived: (archived === "any")?undefined: qsToBool(archived) ?? (false),
    author: (author || undefined) as string,
    type: (type || undefined) as "html"|"voyager"|undefined,
  };
  
  let [scenes, serverTags] =  await Promise.all([
    (await vfs.getScenes(u? u.uid:undefined, sceneParams)).map(mapScene.bind(null, req)),
    vfs.getTags({user_id: u?.uid ?? null}),
  ]);

  let pager = {
    from: sceneParams.offset,
    to: sceneParams.offset + scenes.length,
    next: undefined as any,
    previous: undefined as any
  };
  if(sceneParams.limit === scenes.length){
    const nextUrl = new URL(req.originalUrl, host);
    nextUrl.searchParams.set("offset", (sceneParams.offset+sceneParams.limit).toString());
    pager.next = nextUrl.pathname+nextUrl.search;
  }
  if(sceneParams.offset){
    const prevUrl = new URL(req.originalUrl, host);
    prevUrl.searchParams.set("offset", Math.max(0, sceneParams.offset - sceneParams.limit).toString());
    pager.previous = prevUrl.pathname+prevUrl.search;
  }

  //Sanitize user input
  const validatedParams = ScenesVfs._validateSceneQuery(sceneParams);
  if((!validatedParams.access) && (u? u.level != "admin": true)) validatedParams.access = "read";
  res.render("search", {
    title: "Search",
    scenes,
    params: validatedParams,
    isSearchPage: true, //Hide the navbar's search field because we otherwise have a duplicate "match" input
    pager,
    tagSuggestions: serverTags.map(t=>t.name)
  });
});

//Ensure no unauthorized access
//Additionally, sets res.locals.access, required for the "scene" template
routes.use("/:scene", policy({ access: "read" }));

routes.get("/:scene", async (req, res)=>{
  const requester = getUser(req);
  const vfs = getVfs(req);
  const um = getUserManager(req);
  const {scene:scene_name} = req.params;
  let scene = mapScene(req, await vfs.getScene(scene_name, requester? requester.uid: undefined));

  let [permissions, meta, serverTags] = await Promise.all([
    um.getAcl(scene.id),
    vfs.getSceneMeta(scene_name),
    vfs.getTags({user_id: requester?.uid ?? null}),
  ]);

  const groupPermissions = permissions.filter((permission)=>("groupName" in permission));
  const userPermissions = permissions.filter((permission)=>("username" in permission));
  
  const tagSuggestions = serverTags.filter(t=>{
    let res = scene.tags.indexOf(t.name) === -1;
    return res;
  }).map(t=>t.name);

  let displayedTitle = meta.primary_title;
  let displayedIntro = meta.primary_intro;
  const language = getSession(req)?.lang;
  if (language !== undefined){
      if(meta.titles && language.toUpperCase() in meta.titles){
        displayedTitle = meta.titles[language.toUpperCase()];
      }
      if(meta.intros && language in meta.intros){
        displayedIntro = meta.intros[language.toUpperCase()];
      }
  }

  let onboarding: boolean = scene.mtime.valueOf() < scene.ctime.valueOf()+2000  && scene.access === "admin";
  res.render("scene/scene", {
    layout: "scene",
    title: `eCorpus: ${scene.name}`,
    displayedTitle,
    displayedIntro,
    scene,
    meta,
    groupPermissions,
    userPermissions,
    tagSuggestions,
    onboarding,
  });
});

routes.get("/:scene/tasks", policy({ access: "admin" }), async (req, res) => {
  const { scene: scene_name } = req.params;
  const vfs = getVfs(req);

  const scene = mapScene(req, await vfs.getScene(scene_name));

  const { type, status, limit, offset } = parseTaskListQuery(req);

  const [tasks, types] = await Promise.all([
    getTaskScheduler(req).getTaskTrees({ scene_id: scene.id, type, status, limit, offset }),
    getTaskScheduler(req).getTaskTypes({ scene_id: scene.id }),
  ]);

  res.render("scene/tasks", {
    layout: "scene",
    title: `Tasks — ${scene.name}`,
    scene,
    tasks,
    types,
    pager: getTaskListPager(req, { limit, offset }, tasks.length),
    params: { type, status, limit, offset },
  });
});

routes.get("/:scene/view", async (req, res) => {
  let {scene} = req.params;
  let {lang, tour} = req.query;
  let host = getHost(req);
  let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
  const requester = getUser(req);
  let vfs = getVfs(req);
  const sceneData = await vfs.getScene(scene, requester?.uid);
  let thumb = sceneData.thumb ?? new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host).toString();
  if (sceneData.type == "html") {
    return res.redirect(302, `/scenes/${scene}/index.html`);
  } else {
    let script = undefined;
    if(tour && !Number.isNaN(parseInt(tour as any))){
      script = `
      const v = document.querySelector("voyager-explorer");
      v?.on("model-load",()=>{
        v?.toggleTours();
        v?.setTourStep(${parseInt(tour as any)}, 0, true);
      })
    `;
    }


    res.render("scene/explorer", {
      title: `${scene}: Explorer`,
      layout: "viewer",
      scene,
      thumb: thumb,
      referrer: referrer.toString(),
      script
    });
  }
});


routes.get("/:scene/edit", policy({ access: "write" }), (req, res)=>{
  let {scene} = req.params;
  let {mode="Edit"} = req.query;
  let host = getHost(req);
  let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
  let thumb = new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host);

  res.render("scene/story", {
    title: `${scene}: Story Editor`,
    layout: "viewer",
    scene,
    thumb: thumb.toString(),
    referrer: referrer.toString(),
    mode,
  });
});

//Both history views follow /history/** exactly: a page the API would refuse
//(or would refuse to a page's reader) misrepresents the permissions in force.
routes.get("/:scene/history", policy({ scope: "history:read", access: "read" }), async (req, res)=>{
  let vfs = getVfs(req);
  let host = getHost(req);
  let {scene:scene_name} = req.params;
  let scene = mapScene(req, await vfs.getScene(scene_name));
  const access = res.locals.access as AccessLevel;

  const limit = Math.min(100, Math.max(1, qsToInt(req.query.limit) ?? 25));
  const offset = Math.max(0, qsToInt(req.query.offset) ?? 0);

  const [entries, total] = await Promise.all([
    vfs.getSceneHistory(scene.id, {limit, offset, orderDirection: "desc"}),
    vfs.getSceneHistoryCount(scene.id),
  ]);

  const days = aggregateHistory(entries);
  // The current version (newest entry on the first page) can't be restored to —
  // it's identical to the live scene. Only that single entry is disabled.
  const headId = offset === 0 ? (entries[0]?.id ?? null) : null;

  let pager :{from:number, to:number, total:number, next?:string, previous?:string} = {
    from: offset,
    to: offset + entries.length,
    total,
  };
  if(offset + entries.length < total){
    const nextUrl = new URL(req.originalUrl, host);
    nextUrl.searchParams.set("offset", (offset + limit).toString());
    nextUrl.searchParams.set("limit", limit.toString());
    pager.next = nextUrl.pathname + nextUrl.search;
  }
  if(offset){
    const prevUrl = new URL(req.originalUrl, host);
    prevUrl.searchParams.set("offset", Math.max(0, offset - limit).toString());
    prevUrl.searchParams.set("limit", limit.toString());
    pager.previous = prevUrl.pathname + prevUrl.search;
  }

  res.render("scene/history", {
    layout: "scene",
    title: `eCorpus: History of ${scene_name}`,
    scene,
    name: scene_name,
    canAdmin: AccessLevel.Admin <= access,
    days,
    headId,
    pager,
    limit,
    offset,
    isFirstPage: offset === 0,
  });
})

routes.get("/:scene/settings", policy({ access: "admin" }), async (req, res) => {
  const requester = getUser(req);
  const vfs = getVfs(req);
  const um = getUserManager(req);
  const {scene: scene_name} = req.params;
  const scene = mapScene(req, await vfs.getScene(scene_name, requester?.uid));

  const [permissions, serverTags] = await Promise.all([
    um.getAcl(scene.id),
    vfs.getTags({user_id: requester?.uid ?? null}),
  ]);

  const groupPermissions = permissions.filter(p => "groupName" in p);
  const userPermissions  = permissions.filter(p => "username" in p);
  const tagSuggestions   = serverTags.filter(t => !scene.tags.includes(t.name)).map(t => t.name);

  res.render("scene/settings", {
    layout: "scene",
    title: `Settings — ${scene.name}`,
    scene,
    groupPermissions,
    userPermissions,
    tagSuggestions,
  });
});

routes.get("/:scene/history/:id/view", policy({ scope: "history:read", access: "read" }), async (req, res)=>{
  let vfs = getVfs(req);
  //scene_name is actually already validated through the policy above
  let {scene:scene_name, id} = req.params;
  let scene = await vfs.getScene(scene_name);
  let thumb = new URL(`/scenes/${encodeURIComponent(scene_name)}/scene-image-thumb.jpg`, getHost(req));
  
  res.render("scene/explorer", {
    title: `eCorpus: History of ${scene_name}`,
    layout: "viewer",
    scene: scene_name,
    thumb: thumb.toString(),
    referrer: `/ui/scenes/${scene.name}/history`,
    scenePath: `/history/${encodeURIComponent(scene.name)}/${encodeURIComponent(id)}/show/`,
  })
});

export default routes;
