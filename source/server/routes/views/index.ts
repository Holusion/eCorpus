import { Router, Request, Response, NextFunction } from "express";
import { canRead, getHost, canWrite, getSession, getVfs, getUser, isAdministrator, getUserManager, canAdmin, getLocals, canonical, isMemberOrManage, isManage, isEmbed } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import { Scene } from "../../vfs/types.js";
import ScenesVfs from "../../vfs/Scenes.js";
import { qsToBool, qsToInt } from "../../utils/query.js";
import { isUserAtLeast, UserRoles } from "../../auth/User.js";
import { locales } from "../../utils/templates.js";
import { BadRequestError } from "../../utils/errors.js";
import { mapScene } from "./scene.js";



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
  const user = getUser(req);
  if(user == null || UserRoles.indexOf(user.level) < 1){
    return res.redirect(302, `/auth/login?redirect=${encodeURI("/ui/user")}`);
  }
  res.render("user/settings", {
    layout: "user",
    title: "eCorpus User Settings",
  });
}));

routes.get("/user/groups", wrap(async (req, res)=>{
  const user = getUser(req);
  if(user == null || UserRoles.indexOf(user.level) < 1){
    return res.redirect(302, `/auth/login?redirect=${encodeURI("/ui/user")}`);
  }
  const userManager = getUserManager(req);
  const groups = await userManager.getGroupsOfUser(user?.uid);
  res.render("user/groups", {
    layout: "user",
    title: "eCorpus User Settings",
    groups
  });
}));

routes.get("/user/archives", wrap(async (req, res)=>{
  const vfs = getVfs(req);
  const user = getUser(req);
  if(user == null || UserRoles.indexOf(user.level) < 1){
    return res.redirect(302, `/auth/login?redirect=${encodeURI("/ui/user")}`);
  }
  let archives = await vfs.getScenes(user.uid, {archived: true, author: user.username});
  res.render("user/archives", {
    layout: "user",
    title: "eCorpus User Settings",
    archives,
  });
}));



routes.use("/admin", (await import("./admin.js")).default);

routes.use("/scenes",(await import("./scene.js")).default);

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