import { Request, Response } from "express";
import {js2xml} from "xml-js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { getHost, getVfs } from "../../utils/locals.js";

interface EmbedParams{
  url: string,
  width: number,
  height: number,
  title: string,
  author?: string,
}
type CommonEmbedParams = Omit<EmbedParams, "url"|"title"|"author">&Partial<EmbedParams>;

const isEmbedParams = (opts: CommonEmbedParams): opts is EmbedParams =>{
  return typeof opts.url === "string" && typeof opts.title === "string";
}

const asIframe = ({url, title, width, height}:EmbedParams)=>{
  return `<iframe name="eCorpus Voyager" title="${title}" src="${url}" width="${width}" height="${height}" allow="xr; xr-spatial-tracking; fullscreen"></iframe>`;
}

const asJSON = (params: EmbedParams)=>JSON.stringify({
	"version": "1.0",
	"type": "rich",
	"provider_name": new URL("/", params.url).hostname,
	"provider_url": new URL("/", params.url).toString(),
	"width": params.width,
	"height": params.height,
	"title": params.title,
	"author_name": params.author,
	"html": asIframe(params),
});

const asXML = (params: EmbedParams)=>`<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<oembed>
	<version>1.0</version>
	<type>rich</type>
	<provider_name>${new URL("/", params.url).hostname}</provider_name>
	<provider_url>${new URL("", params.url).toString()}</provider_url>
  <width>${params.width}</width>
  <height>${params.height}</height>
  <title>${params.title}</title>
	<author_name>${params.author}</author_name>
  ${js2xml({html:{ //properly escape the iframe string
    _text: asIframe(params),
  }}, {compact: true})}
</oembed>
`

export async function getEmbed(req: Request, res: Response){
  let vfs = getVfs(req);
  const {format='json', url, maxwidth='800', maxheight='450'} = req.query;
  if(format !== "json" && format !== "xml") return res.status(501).send("Not Implemented");
  if(!url || typeof url !== "string") throw new BadRequestError(`No embed URL query provided`);

  const opts :CommonEmbedParams = {
    width: parseInt(maxwidth as string),
    height: parseInt(maxheight as string),
  }

  const target = new URL(decodeURIComponent(url));
  const pathname = decodeURIComponent(target.pathname);
  const m = /^\/(?:ui\/)?(?:scenes\/(?<scene>[^/]+)(\/view)?|tags\/(?<tag>[^/]+))\/?$/.exec(pathname);
  if(m?.groups!.scene){
    let scene = await vfs.getScene(m.groups!.scene);
    if(scene.public_access =="none"){
      throw new NotFoundError(`No public embeddable resource at ${url}`);
    }
    let meta =  await vfs.getSceneMeta(scene.name);
    Object.assign(opts, {
      url: new URL(`/ui/scenes/${encodeURIComponent(scene.name)}/view`, getHost(req)).toString(),
      title: meta.primary_title ?? scene.name,
      author: scene.author,
    });
  }else if(m?.groups!.tag){
    let tag = await vfs.getTag(m.groups.tag, null);
    if(!tag.length) throw new NotFoundError(`No tag found with name ${m.groups.tag}`);
    Object.assign(opts, {
      url: new URL(`/ui/tags/${encodeURIComponent(m.groups.tag)}`, getHost(req)).toString(),
      title: m.groups.tag,
    });
  }

  if(isEmbedParams(opts)){
    return res.set("Content-Type", format === "json"?"application/json":"text/xml"+"; charset=utf-8").status(200).send(format == "json"? asJSON(opts): asXML(opts));  
  }else{
    throw new NotFoundError(`No public embeddable resource at ${url}`);
  }
}