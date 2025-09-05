import { Router, Request, Response, NextFunction } from "express";
import { canRead, getHost, canWrite, getSession, getVfs, getUser, isAdministrator, getUserManager, canAdmin, getLocals, canonical } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import path from "path";
import { Scene } from "../../vfs/types.js";
import { AccessType, toAccessLevel } from "../../auth/UserManager.js";
import ScenesVfs from "../../vfs/Scenes.js";
import scrapDoc from "../../utils/schema/scrapDoc.js";
import { qsToBool, qsToInt } from "../../utils/query.js";
import { UserRoles } from "../../auth/User.js";
import { locales } from "../../utils/templates.js";



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
  const tags = await vfs.getTags();
  res.render("tags", {
    title: "eCorpus Tags",
    tags,
  });
}));

routes.get("/tags/:tag", wrap(async (req, res)=>{
  const host = getHost(req);
  const vfs = getVfs(req);
  const requester = getUser(req);
  const {tag} = req.params;
  const ids = await vfs.getTag(tag);
  const scenes = await Promise.all(ids.map(async id=>{
      let scene =  await vfs.getScene(id, requester.uid);
      return mapScene(req, scene);
    }))
  res.render("tag", {
    title: "eCorpus "+tag,
    tag,
    scenes,
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
    (await vfs.getScenes(u.uid, sceneParams)).map(mapScene.bind(null, req)),
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
  if((!validatedParams.access) && u.level != "admin") validatedParams.access = "read";
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
  let archives = await vfs.getScenes(user.uid, {archived: true, author: user.username});
  if(UserRoles.indexOf(user.level) < 1){
    return res.redirect(302, `/auth/login?redirect=${encodeURI("/ui/user")}`);
  }
  res.render("user", {
    title: "eCorpus User Settings",
    archives,
  });
}));

routes.use("/admin", isAdministrator);
routes.get("/admin", (req, res)=>{
  res.render("admin/home", {
    layout: "admin",
    title: "eCorpus Administration",
  });
});

routes.get("/admin/archives", wrap(async (req, res)=>{
  const vfs = getVfs(req);
  let scenes = await vfs.getScenes(null, {archived: true, limit: 100 });
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

routes.get("/admin/stats", wrap(async (req, res)=>{
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
  let scene = mapScene(req, await vfs.getScene(scene_name, requester.uid));

  let [permissions, meta, serverTags] = await Promise.all([
    um.getPermissions(scene.id),
    vfs.getSceneMeta(scene_name),
    vfs.getTags(),
  ]);

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
    permissions,
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

routes.get("/scenes/:scene/history", canAdmin, wrap(async (req, res)=>{
  let vfs = getVfs(req);
  //scene_name is actually already validated through canAdmin
  let {scene:scene_name} = req.params;
  let scene = await vfs.getScene(scene_name);
  
  res.render("history", {
    title: `eCorpus: History of ${scene_name}`,
    name: scene_name,
  })
}))

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