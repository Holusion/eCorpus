import { Router, Request, Response } from "express";
import { canRead, getHost, canWrite, getSession, getVfs, getUser } from "../../utils/locals.js";
import wrap from "../../utils/wrapAsync.js";
import path from "path";
import { Scene } from "../../vfs/types.js";



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

routes.use("/", (req :Request, res:Response, next)=>{
  const session = getSession(req);
  const user = getUser(req);
  const {search} = req.query;
  const lang = session?.lang ?? (req.acceptsLanguages(["fr", "en"]) || "en");
  Object.assign(res.locals, {
    lang,
    languages: [
      {selected: lang === "fr", code: "fr", key: "lang.fr"},
      {selected: lang === "en", code: "en", key: "lang.en"},
    ],
    user: user,
    location: req.originalUrl,
    search,
  })
  next();
});


routes.get("/", wrap(async (req, res)=>{
  const user = getUser(req);
  if(!user || user.isDefaultUser){
    return res.render("landing", {
      title: "eCorpus Home",
    });
  }
  const vfs = getVfs(req);
  let [recentChanges, userScenes, recentScenes] = (await Promise.all([
    await vfs.getScenes(user.uid,{
      limit: 10,
      orderBy: "mtime",
      orderDirection: "desc"
    }),
    await vfs.getScenes(user.uid,{
      limit: 4,
      orderBy: "mtime",
      orderDirection: "desc",
      author: user.uid,
    }),
    await vfs.getScenes(user.uid,{
      limit: 4,
      orderBy: "ctime",
      orderDirection: "desc",
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

routes.get("/scenes", (req, res)=>{
  res.render("layouts/main", {
    layout: null,
    title: "eCorpus Search",
    body: `<corpus-list></corpus-list>`,
  });
});

routes.get("/user", (req, res)=>{
  const user = getUser(req);
  console.log("Get for user : ", user);
  if(user.isDefaultUser){
    return res.redirect(302, "/ui/");
  }
  res.render("layouts/main", {
    layout: null,
    title: "eCorpus User Settings",
    body: `<user-settings></user-settings>`,
  });
});

routes.get("/admin", (req, res)=>{
  res.render("admin/home", {
    layout: "admin",
    title: "eCorpus Administration",
  });
});

routes.get("/admin/archives", (req, res)=>{
  res.render("admin/archives", {
    layout: "admin",
    title: "eCorpus Administration: Archived scenes",
  });
});

routes.get("/admin/users", (req, res)=>{
  res.render("admin/users", {
    layout: "admin",
    title: "eCorpus Administration: Users list",
  });
});

routes.get("/admin/stats", (req, res)=>{
  res.render("admin/stats", {
    layout: "admin",
    title: "eCorpus Administration: Instance Statistics",
  });
});

routes.use("/scenes/:scene", canRead);

routes.get("/scenes/:scene", (req, res)=>{
  const {scene} = req.params;
  res.render("layouts/main", {
    layout: null,
    title: "eCorpus Administration",
    body: `<scene-history name="${scene}"></scene-history>`,
  });
});

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