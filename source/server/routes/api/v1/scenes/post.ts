import fs from "fs/promises";
import path from "path";
import {once} from "events";

import { Request, Response } from "express";
import { getHost, getUser, getVfs } from "../../../../utils/locals";
import { wrapFormat } from "../../../../utils/wrapAsync";
import { zip } from "../../../../utils/zip";
import { Uid } from "../../../../utils/uid";
import { unzip } from "../../../../utils/zip";
import { HTTPError } from "../../../../utils/errors";
import { createReadStream } from "fs";
import { getMimeType } from "../../../../utils/filetypes";


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


    for (let record of await unzip(tmpfile)){
      let {groups:{scene, name}={} as any} = /^scenes\/(?<scene>[^/]+)(?:\/(?<name>.+))?\/?$/.exec(record.filename) ?? {};
      if(!scene){
        results.fail.push(`${record.filename}: not matching pattern`);
        continue;
      }

      if(!name){
        //Create the scene
        try{
          let s = await vfs.createScene(scene);
        }catch(e){
          if((e as HTTPError).code != 409) throw e;
          //Scene already exist, it's OK.
        }
        results.ok.push(scene);
      }else if(record.isDirectory){
        /** @fixme handle folders creation */
        continue;
      }else if(name.endsWith(".svx.json")){
        let data = Buffer.alloc(record.end-record.start);
        let handle = await fs.open(tmpfile, "r");
        try{
          await handle.read({buffer:data, position:record.start});
        }finally{
          await handle.close();
        }
        await vfs.writeDoc(data.toString("utf8"), scene, requester.uid);
        results.ok.push(`${scene}/${name}`);
      }else{
        //Add the file
        let rs = createReadStream(tmpfile, {start: record.start, end: record.end});
        let f = await vfs.writeFile(rs, {user_id: requester.uid, scene, name, mime: getMimeType(name)});
        results.ok.push(`${scene}/${name}`);
      }
    }
  }finally{
    await fs.rm(tmpfile, {force: true});
  }
  res.status(200).send(results);
};