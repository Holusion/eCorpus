import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";

import { Request, Response } from "express";
import yauzl, { Entry, ZipFile } from "yauzl";

import { HTTPError } from "../../utils/errors.js";
import { getMimeType } from "../../utils/filetypes.js";
import { getVfs, getUser } from "../../utils/locals.js";
import { Uid } from "../../utils/uid.js";
import { once } from "events";
import { Readable } from "stream";


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
  let handle = await fs.open(tmpfile, "wx+");
  try{
    for await (let data of req){
      await handle.write(data);
    }
  }catch(e){
    await fs.rm(tmpfile, {force: true}).catch(e=>{});
    throw e;
  }
  finally{
    await handle.close();
  }
  await vfs.isolate(async (vfs)=>{
    let zip = await new Promise<ZipFile>((resolve,reject)=>yauzl.open(tmpfile, {lazyEntries: true, autoClose: true}, (err, zip)=>(err?reject(err): resolve(zip))));
    const openZipEntry = (record:Entry)=> new Promise<Readable>((resolve, reject)=>zip.openReadStream(record, (err, rs)=>(err?reject(err): resolve(rs))));
    
    //Directory entries are optional in a zip file so we should handle their absence
    let scenes = new Map<string, Set<string>>();

    const onEntry = async (record :Entry) =>{
      const pathParts = record.fileName.split("/");
      if(pathParts[0] == "scenes") pathParts.shift();
      const scene = pathParts.shift();
      const name = pathParts.join("/");
      if(!record.fileName.endsWith("/")) pathParts.pop();//Drop the file name unless it's a directory

      if(!scene){
        results.fail.push(`${record.fileName}: not matching pattern`);
        return
      }
      if(!scenes.has(scene)){
        //Create the scene
        try{
          await vfs.createScene(scene, requester.uid);
          results.ok.push(scene);
        }catch(e){
          if((e as HTTPError).code != 409) throw e;
          //409 == Scene already exist, it's OK.
        }
        scenes.set(scene, new Set());
      }
      if(!name) return;
      let folders = scenes.get(scene)!;
      let dirpath = "";
      while(pathParts.length){
        dirpath = path.join(dirpath, pathParts.shift()!);
        if(folders.has(dirpath)) continue;
        folders.add(dirpath);
        try{
          await vfs.createFolder({scene, name: dirpath, user_id: requester.uid});
          results.ok.push(`${scene}/${dirpath}/`);
        }catch(e){
          if((e as HTTPError).code != 409) throw e;
          //409 == Folder already exist, it's OK.
        }
      }

      if(/\/$/.test(record.fileName)){
        // Is a directory. Do nothing, handled above.
      }else if(name.endsWith(".svx.json")){
        let data = Buffer.alloc(record.uncompressedSize), size = 0;
        let rs = await openZipEntry(record);
        for await (let chunk of rs){
          chunk.copy(data, size);
          size += chunk.length;
        }
        await vfs.writeDoc(data.toString("utf8"), {scene, user_id: requester.uid, name, mime: "application/si-dpo-3d.document+json"});
      }else{
        //Add the file
        let rs = await openZipEntry(record);
        await vfs.writeFile(rs, {user_id: requester.uid, scene, name, mime: getMimeType(name)});
      }
      
      results.ok.push(`${scene}/${name}`);
    };

    zip.on("entry", (record)=>{
      onEntry(record).then(()=> zip.readEntry(), (e)=>{
        console.log("unzip error :", e);
        results.fail.push(`Unzip error : ${e.message}`);
        zip.close();
      });
    });
    zip.readEntry();
    await once(zip, "close");
  }).finally(() => fs.rm(tmpfile, {force: true}));

  res.status(200).send(results);
};