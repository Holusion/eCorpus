import { Router, Request, Response, NextFunction } from "express";
import { canRead, getHost, canWrite, getSession, getVfs, getUser, isAdministrator, getUserManager, canAdmin, getLocals, canonical, isMemberOrManage, isManage, isEmbed } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import path from "path";
import { Scene } from "../../vfs/types.js";
import ScenesVfs from "../../vfs/Scenes.js";
import { qsToBool, qsToInt } from "../../utils/query.js";
import { isUserAtLeast, UserRoles } from "../../auth/User.js";
import { locales } from "../../utils/templates.js";
import { BadRequestError } from "../../utils/errors.js";



function mapScene(req :Request, {thumb, name, ...s}:Scene):Scene{
  if(thumb){
    thumb = new URL(path.join("/scenes/", encodeURIComponent(name), encodeURIComponent(thumb)), getHost(req)).toString();
  }
  return {thumb, name, ...s};
}

const routes = Router();
/**
 * Set permissive cache-control for ui pages
 */
routes.use("/", (req :Request, res:Response, next)=>{
  res.set("Cache-Control", `max-age=${30*60}, public`);
  next();
});

/**
 * Common properties for template rendering.
 * All props required for navbar/footer rendering should be set here
 */
export function useTemplateProperties(req :Request, res:Response, next?:NextFunction){
  const session = getSession(req);
  const {config} = getLocals(req);
  const user = getUser(req);
  const {search} = req.query;
  const lang = session?.lang ?? (req.acceptsLanguages(locales) || "en");
  Object.assign(res.locals, {
    lang,
    languages: [
      {selected: lang === "fr", code: "fr", key: "lang.fr"},
      {selected: lang === "en", code: "en", key: "lang.en"},
    ],
    user: user,
    location: req.originalUrl,
    search,
    brand: config.brand,
    embeddable: req.originalUrl.startsWith("/ui/") && ("scene" in req.params || "tag" in req.params),
    canonical: canonical(req).toString(),
    root_url: canonical(req, "/").toString(),
  });
  if(next) next();
}

routes.use("/", useTemplateProperties);


routes.get("/", wrap(async (req, res)=>{
  const user = getUser(req);
  if(!user || user.level === "none"){
    return res.render("login", {
      title: "eCorpus Home",
      user: null,
    });
  }
  const vfs = getVfs(req);
  let [recentChanges, userScenes, recentScenes] = (await Promise.all([
    await vfs.getScenes(user.uid,{
      limit: 10,
      orderBy: "mtime",
      orderDirection: "desc",
      archived: false,
    }),
    await vfs.getScenes(user.uid,{
      limit: 4,
      orderBy: "mtime",
      orderDirection: "desc",
      author: user.username,
      archived: false,
    }),
    await vfs.getScenes(user.uid,{
      limit: 4,
      orderBy: "ctime",
      orderDirection: "desc",
      archived: false,
    })
  ])).map((scenes:Scene[])=> scenes.map(mapScene.bind(null, req)));
  res.render("home", {
    title: "eCorpus Home",
    recentChanges,
    userScenes,
    recentScenes,
  });
}));

routes.get("/upload", (req, res)=>{
  res.render("upload", {
    title: "eCorpus: Create new scene",
  });
})

routes.get("/tags", wrap(async (req, res)=>{
  const vfs = getVfs(req);
  const {match, limit:limitString, offset:offsetString} =  req.query;
  const requester = getUser(req);
  const host = getHost(req);

  const limit = limitString? parseInt(limitString as any): 12;
  const offset = offsetString? parseInt(offsetString as any): 0;

  if(match && typeof match !== "string") throw new BadRequestError("Unsupported match parameter");
  if(!Number.isInteger(limit) || limit < 1 || 100 < limit) throw new BadRequestError(`invalid limit parameter : ${limitString}`);
  if(!Number.isInteger(offset) || offset < 0) throw new BadRequestError(`invalid offset parameter : ${offsetString}`);



  let tags: Array<{name: string, size: number, scenes?: {name: string, thumb:string|null|undefined, uri:string}[]}> = await vfs.getTags({like: match, limit, offset});
  for(let tag of tags){
    let scene_ids = await vfs.getTag(tag.name, requester?.uid ?? null);
    tag.scenes ??= [];
    for(let id of scene_ids.slice(0, 6)){
      let scene = mapScene(req, await vfs.getScene(id, requester?.uid));
      tag.scenes.push({
        name: scene.name,
        uri: `/ui/scenes/${encodeURIComponent(scene.name)}`,
        thumb: scene.thumb,
      });
    }
    if(6 < scene_ids.length){
      tag.scenes.splice(-1, 1, {
        name: "More scenes",
        uri: `/ui/tags/${encodeURIComponent(tag.name)}`,
        thumb: "/dist/images/moreSprite.svg",
      })
    }
  }

  let pager = {
    from: offset,
    to: offset + tags.length,
    next: undefined as any,
    previous: undefined as any
  };
  if(limit === tags.length){
    const nextUrl = new URL(req.originalUrl, host);
    nextUrl.searchParams.set("offset", (offset+limit).toString());
    pager.next = nextUrl.pathname+nextUrl.search;
  }
  if(offset){
    const prevUrl = new URL(req.originalUrl, host);
    prevUrl.searchParams.set("offset", Math.max(0, offset - limit).toString());
    pager.previous = prevUrl.pathname+prevUrl.search;
  }
 
  res.render("tags", {
    title: "eCorpus Tags",
    tags: tags.filter(t=>t.scenes?.length),
    match,
    pager,
  });
}));

routes.get("/tags/:tag", wrap(async (req, res)=>{
  const host = getHost(req);
  const vfs = getVfs(req);
  const requester = getUser(req);
  const {tag} = req.params;
  const ids = await vfs.getTag(tag, requester ? requester.uid : null);
  const scenes = await Promise.all(ids.map(async id=>{
      let scene =  await vfs.getScene(id,  requester ? requester.uid : null);
      return mapScene(req, scene);
    }))
  const embedded = isEmbed(req);
  res.render("tag", {
    layout: embedded? "embed": "main",
    embedded,
    title: "eCorpus "+tag,
    tag,
    scenes,
  });
}));

routes.get("/groups/:group", isMemberOrManage, wrap(async (req, res)=>{
  const host = getHost(req);
  const userManager = getUserManager(req);
  const requester = getUser(req);
  const {group} = req.params;
  const groupObj = await userManager.getGroup(group);
  res.render("group", {
    name: groupObj.groupName,
    id: groupObj.groupUid,
    manageAccess: requester? isUserAtLeast(requester, "manage"): false,
    scenes: groupObj.scenes,
    members: groupObj.members,
  });
}));


routes.get("/scenes", wrap(async (req, res)=>{
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
    author: author as string,
  };
  
  let [scenes, serverTags] =  await Promise.all([
    (await vfs.getScenes(u? u.uid:undefined, sceneParams)).map(mapScene.bind(null, req)),
    vfs.getTags(),
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
    title: "eCorpus Search",
    scenes,
    params: validatedParams,
    isSearchPage: true, //Hide the navbar's search field because we otherwise have a duplicate "match" input
    pager,
    tagSuggestions: serverTags.map(t=>t.name)
  });
}));

routes.get("/user", wrap(async (req, res)=>{
  const vfs = getVfs(req);
  const user = getUser(req);
  if(user == null || UserRoles.indexOf(user.level) < 1){
    return res.redirect(302, `/auth/login?redirect=${encodeURI("/ui/user")}`);
  }
  const userManager = getUserManager(req);
  const groups = await userManager.getGroupsOfUser(user?.uid);
  let archives = await vfs.getScenes(user.uid, {archived: true, author: user.username});
  res.render("user", {
    title: "eCorpus User Settings",
    archives,
    groups
  });
}));

routes.use("/admin", isManage);
routes.get("/admin", (req, res)=>{
  res.render("admin/home", {
    layout: "admin",
    title: "eCorpus Administration",
  });
});

routes.get("/admin/archives", isAdministrator, wrap(async (req, res)=>{
  const vfs = getVfs(req);
  const user = getUser(req);
  let scenes = await vfs.getScenes(user?.uid, {archived: true, limit: 100 });
  res.render("admin/archives", {
    layout: "admin",
    title: "eCorpus Administration: Archived scenes",
    scenes,
  });
}));

routes.get("/admin/users", wrap(async (req, res)=>{
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

routes.get("/admin/groups", isManage, wrap(async (req, res)=>{
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

routes.get("/admin/stats", isAdministrator,  wrap(async (req, res)=>{
  const stats = await getVfs(req).getStats();
  res.render("admin/stats", {
    layout: "admin",
    title: "eCorpus Administration: Instance Statistics",
    stats,
  });
}));

//Ensure no unauthorized access
//Additionally, sets res.locals.access, required for the "scene" template
routes.use("/scenes/:scene", canRead);

routes.get("/scenes/:scene", wrap(async (req, res)=>{
  const requester = getUser(req);
  const vfs = getVfs(req);
  const um = getUserManager(req);
  const {scene:scene_name} = req.params;
  let scene = mapScene(req, await vfs.getScene(scene_name, requester? requester.uid: undefined));

  let [permissions, meta, serverTags] = await Promise.all([
    um.getPermissions(scene.id),
    vfs.getSceneMeta(scene_name),
    vfs.getTags(),
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

  res.render("scene", {
    title: `eCorpus: ${scene.name}`,
    displayedTitle,
    displayedIntro,
    scene,
    meta,
    groupPermissions,
    userPermissions,
    tagSuggestions,
  });
}));

routes.get("/scenes/:scene/view", (req, res)=>{
  let {scene} = req.params;
  let {lang, tour} = req.query;
  let host = getHost(req);
  let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
  let thumb = new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host);
  
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


  res.render("explorer", {
    title: `${scene}: Explorer`,
    layout: "viewer",
    scene,
    thumb: thumb.toString(),
    referrer: referrer.toString(),
    script
  });
});


routes.get("/scenes/:scene/edit", canWrite, (req, res)=>{
  let {scene} = req.params;
  let {mode="Edit"} = req.query;
  let host = getHost(req);
  let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);
  let thumb = new URL(`/scenes/${encodeURIComponent(scene)}/scene-image-thumb.jpg`, host);

  res.render("story", {
    title: `${scene}: Story Editor`,
    layout: "viewer",
    scene,
    thumb: thumb.toString(),
    referrer: referrer.toString(),
    mode,
  });
});

routes.get("/scenes/:scene/history", canWrite, wrap(async (req, res)=>{
  let vfs = getVfs(req);
  //scene_name is actually already validated through canAdmin
  let {scene:scene_name} = req.params;
  let scene = await vfs.getScene(scene_name);
  
  res.render("history", {
    title: `eCorpus: History of ${scene_name}`,
    name: scene_name,
    canAdmin: res.locals.access === "admin",
  });
}))

routes.get("/scenes/:scene/history/:id/view", canWrite, wrap(async (req, res)=>{
  let vfs = getVfs(req);
  //scene_name is actually already validated through canAdmin
  let {scene:scene_name, id} = req.params;
  let scene = await vfs.getScene(scene_name);
  let thumb = new URL(`/scenes/${encodeURIComponent(scene_name)}/scene-image-thumb.jpg`, getHost(req));
  
  res.render("explorer", {
    title: `eCorpus: History of ${scene_name}`,
    layout: "viewer",
    scene: scene_name,
    thumb: thumb.toString(),
    referrer: `/ui/scenes/${scene.name}/history`,
    scenePath: `/history/${encodeURIComponent(scene.name)}/${encodeURIComponent(id)}/show/`,
  })
}));

routes.get("/standalone", (req, res)=>{
  let host = getHost(req);
  let referrer = new URL(req.get("Referrer")||`/ui/scenes/`, host);

  res.render("story", {
    layout: "viewer",
    title: `Standalone Story`,
    mode: "Standalone",
    thumb: "/images/sketch_ethesaurus.png",
    referrer: referrer.toString(),
  });
});




export default routes;