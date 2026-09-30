import { Request, Response } from "express";
import { getHost, getLocals } from "../../utils/locals.js";
import { createHash } from "node:crypto";

interface OpenSearchParameters{
  shortName:string,
  summary:string,
  host:string,
}

const render = ({shortName, summary, host}:OpenSearchParameters)=>`
<OpenSearchDescription
  xmlns="http://a9.com/-/spec/opensearch/1.1/"
  xmlns:moz="http://www.mozilla.org/2006/browser/search/">
  <ShortName>${shortName}</ShortName>
  <Description>${summary}</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Image width="32" height="32" type="image/png">${host}dist/favicon.png</Image>
  <Url type="text/html" template="${host}ui/scenes?match={searchTerms}"/>
</OpenSearchDescription>
`;

export function renderOpenSearch(req:Request, res: Response):void{
  const {config} = getLocals(req);
  const host = getHost(req).toString();

  const body = Buffer.from(render({
    shortName: config.get("brand"),
    summary: `Search eCorpus 3D scenes`,
    host,
  }));

  let eTag = createHash("sha256");
  eTag.update(body as any);
  //Strong: this hashes the exact bytes sent below, and this route has a single
  //representation. Marking it weak would understate what it actually validates.
  res.set("ETag", `"${eTag.digest("base64url")}"`);
  if(req.fresh){
    res.status(304).send("Not Modified");
    return;
  }
  
  res.set("Content-Type", "application/opensearchdescription+xml; charset=utf-8");
  res.status(200).send(body);
}