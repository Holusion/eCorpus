
import { createHash } from "crypto";
import { Request, Response } from "express";
import path from "path";
import { once } from "events";
import yazl from "yazl";

import { AccessType } from "../../auth/UserManager.js";
import { HTTPError } from "../../utils/errors.js";
import { getVfs, getUser, getHost } from "../../utils/locals.js";
import { wrapFormat } from "../../utils/wrapAsync.js";
import Vfs from "../../vfs/index.js";
import { compressedMime } from "../../utils/filetypes.js";

export default async function getScenes(req :Request, res :Response){
  let vfs = getVfs(req);
  let u = getUser(req);

  let {
    id: ids,
    name: names,
    match,
    access,
    limit,
    offset,
    orderBy,
    orderDirection,
  } = req.query;

  let accessTypes :AccessType[] = ((Array.isArray(access))?access : (access?[access]:undefined)) as any;

  let scenesList = [];
  if(typeof ids === "string"){
    ids = [ids];
  }
  
  if(Array.isArray(ids)){
    for(let id of ids){
      if(typeof id !== "string") continue;
      let n = parseInt(id);
      if(Number.isNaN(n)) continue;
      scenesList.push(n);
    }
  }

  if(Array.isArray(names)){
    for(let name of names){
      if(typeof name !== "string") continue;
      scenesList.push(name);
    }
  }else if(typeof names === "string"){
    scenesList.push(names);
  }

  let scenes :Awaited<ReturnType<typeof vfs.getScenes>>;
  if(0 < scenesList.length){
    scenes = await Promise.all(scenesList.map(name=>vfs.getScene(name)));
  }else{
    /**@fixme ugly hach to bypass permissions when not performing a search */
    const requester_id = (u.isAdministrator && (!accessTypes || (accessTypes.length == 1 && accessTypes[0] == "none")) && !match)?undefined: u.uid;
    
    scenes = await vfs.getScenes(requester_id, {
      match: match as string,
      orderBy: orderBy as any,
      orderDirection: orderDirection as any,
      access: accessTypes,
      limit: limit? parseInt(limit as string): undefined,
      offset: offset? parseInt(offset as string): undefined,
    });
  }
  
  //canonicalize scenes' thumb names
  scenes = scenes.map(s=>({...s, thumb: (s.thumb? new URL(encodeURI(path.join("/scenes/", s.name, s.thumb)), getHost(req)).toString() : undefined)}))

  let eTag = createHash("sha256")
  let lastModified = 0;
  
  for(let scene of scenes){
    let mtime = scene.mtime.valueOf();
    eTag.update(`${scene.name}:${mtime.toString(32)};`);
    if(lastModified < mtime) lastModified = mtime;
  }

  res.set("Cache-Control", "no-cache, private");
  res.set("ETag", "W/"+eTag.digest("base64url"));
  res.set("Last-Modified", new Date(lastModified).toUTCString());
  if( req.fresh){
    return res.status(304).send("Not Modified");
  }
  
  await wrapFormat(res, {
    "application/json":()=>res.status(200).send({scenes}),

    "text": ()=> res.status(200).send(scenes.map(m=>m.name).join("\n")+"\n"),

    "application/zip": async ()=>{
      res.set("Content-Disposition", `attachment; filename="scenes.zip"`);
      //FIXME : it would be possible to compute content-length ahead of time 
      // but we need to take into account the size of all zip headers
      // It would also allow for strong ETag generation, which would be desirable
      res.status(200);
      let zip = new yazl.ZipFile();
      zip.outputStream.pipe(res, {end: true});
      //@ts-ignore
      zip.on("error", (e)=>console.warn("Error ", e));
      let op = vfs.isolate(async tr =>{
        for(let scene of scenes){
          for await (let file of tr.listFiles(scene.id, {withArchives: false, withFolders: false, withData: true})){
            const metaPath = path.join("scenes", scene.name, file.name);
            const opts = {
              mtime: file.mtime,
              mode: 0o100664,
              compress: compressedMime(file.mime),
            };
            if(file.data){
              zip.addBuffer(Buffer.from(file.data), metaPath, opts);
            }else{
              zip.addFile(vfs.getPath({hash: file.hash}), metaPath, opts );
            }
          }
        }
      }).finally(()=>{
        zip.end();
      });
      //Since this error handling happens after headers are sent, it will cause an abort error without much explanation
      await Promise.all([
        op, // we don't expect this to fail but can't wait for it to complete before listening for error events
        await once(zip as any, "close"),
      ]);
    }
  });
};
