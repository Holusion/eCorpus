import fs from "fs/promises";
import path from "path";

import { Request, Response } from "express";
import { createReadStream } from "fs";

import { HTTPError } from "../../utils/errors.js";
import { getMimeType } from "../../utils/filetypes.js";
import { getVfs, getUser } from "../../utils/locals.js";
import { Uid } from "../../utils/uid.js";
import { unzip } from "../../utils/zip/index.js";


interface ImportResults {
  fail:string[];
  ok:string[];
}


export default async function postScenes(req :Request, res :Response){
  let vfs = getVfs(req);
  let requester = getUser(req);

  let file_name = Uid.toString(Uid.make());
  let tmpfile = path.join(vfs.uploadsDir, file_name);
  let results :ImportResults = {fail:[], ok:[]};
  try{
    let handle = await fs.open(tmpfile, "wx+");
    try{
      for await (let data of req){
        await handle.write(data);
      }
    }finally{
      await handle.close();
    }

    /** @fixme make atomic */
    for (let record of await unzip(tmpfile)){
      let m  = /^(?<contained>scenes\/)?(?<scene>[^/]+)(?:\/(?<name>.+))?\/?$/.exec(record.filename);
      const scene :string|undefined = m?.groups?.scene;
      const name :string|undefined = m?.groups?.name;

      if(!scene){
        results.fail.push(`${record.filename}: not matching pattern`);
        continue;
      }

      if(!name){
        //Create the scene
        try{
          await vfs.createScene(scene, requester.uid);
        }catch(e){
          if((e as HTTPError).code != 409) throw e;
          //409 == Scene already exist, it's OK.
        }
        results.ok.push(scene);
        continue;
      }

      if(record.isDirectory){
        try{
          await vfs.createFolder({scene, name: name.endsWith("/")? name.slice(0, -1): name, user_id: requester.uid});
        }catch(e){
          if((e as HTTPError).code != 409) throw e;
          //409 == Folder already exist, it's OK.
        }
      }else if(name.endsWith(".svx.json")){
        let data = Buffer.alloc(record.end-record.start);
        let handle = await fs.open(tmpfile, "r");
        try{
          await handle.read({buffer:data, position:record.start});
        }finally{
          await handle.close();
        }
        await vfs.writeDoc(data.toString("utf8"), {scene, user_id: requester.uid, name, mime: "application/si-dpo-3d.document+json"});
      }else{
        //Add the file
        let rs = createReadStream(tmpfile, {start: record.start, end: record.end});
        let f = await vfs.writeFile(rs, {user_id: requester.uid, scene, name, mime: getMimeType(name)});
      }
      
      results.ok.push(`${scene}/${name}`);
    }
  }finally{
    await fs.rm(tmpfile, {force: true});
  }
  res.status(200).send(results);
};