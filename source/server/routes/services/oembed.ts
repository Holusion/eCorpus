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


const asIframe = ({url, title, width, height}:EmbedParams)=>{
  return `<iframe name="eCorpus Voyager" title="${title}" src="${url}" width="${width}" height="${width}" allow="xr; xr-spatial-tracking; fullscreen"></iframe>`;
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

  const target = new URL(decodeURIComponent(url));
  const m = /^\/(?:ui\/)?scenes\/([^/]+)(\/view)?\/?$/.exec(decodeURIComponent(target.pathname));

  let scene = m?await vfs.getScene(m[1]):undefined;
  if(!scene || scene.public_access =="none"){
    throw new NotFoundError(`No public embeddable resource at ${url}`);
  }
  let meta =  await vfs.getSceneMeta(scene.name);

  const opts :EmbedParams = {
    url: new URL(`/ui/scenes/${encodeURIComponent(scene.name)}/view`, getHost(req)).toString(),
    width: parseInt(maxwidth as string),
    height: parseInt(maxheight as string),
    title: meta.primary_title ?? scene.name,
    author: scene.author,
  }

  return res.set("Content-Type", format === "json"?"application/json":"text/xml"+"; charset=utf-8").status(200).send(format == "json"? asJSON(opts): asXML(opts));  
}