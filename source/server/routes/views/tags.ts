import { Router } from "express";
import { getHost, getUser, getVfs, isEmbed, mapScene } from "../../utils/locals.js";
import { SceneType } from "../../vfs/types.js";
import { BadRequestError } from "../../utils/errors.js";

/**
 * Scenes by their tags, as /ui/tags/*
 */
const routes = Router();

routes.get("/", async (req, res)=>{
  const vfs = getVfs(req);
  const {match, limit:limitString, offset:offsetString} =  req.query;
  const requester = getUser(req);
  const host = getHost(req);

  const limit = limitString? parseInt(limitString as any): 12;
  const offset = offsetString? parseInt(offsetString as any): 0;

  if(match && typeof match !== "string") throw new BadRequestError("Unsupported match parameter");
  if(!Number.isInteger(limit) || limit < 1 || 100 < limit) throw new BadRequestError(`invalid limit parameter : ${limitString}`);
  if(!Number.isInteger(offset) || offset < 0) throw new BadRequestError(`invalid offset parameter : ${offsetString}`);



  let tags: Array<{name: string, size: number, scenes?: {name: string, thumb:string|null|undefined, uri:string, type: SceneType | "more"}[]}> = await vfs.getTags({like: match, limit, offset});
  for(let tag of tags){
    let scene_ids = await vfs.getTag(tag.name, requester?.uid ?? null);
    tag.scenes ??= [];
    for(let id of scene_ids.slice(0, 6)){
      let scene = mapScene(req, await vfs.getScene(id, requester?.uid));
      tag.scenes.push({
        name: scene.name,
        uri: `/ui/scenes/${encodeURIComponent(scene.name)}`,
        thumb: scene.thumb,
        type: scene.type,
      });
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

  const embedded = isEmbed(req);
  res.render("tags", {
    layout: embedded? "embed": "main",
    embedded,
    title: "Tags",
    tags: tags.filter(t=>t.scenes?.length),
    match,
    pager,
  });
});

routes.get("/:tag", async (req, res)=>{
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
    title: tag,
    tag,
    scenes,
  });
});

export default routes;
