import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";

import { Request, Response } from "express";
import yauzl, { Entry, ZipFile } from "yauzl";

import { BadRequestError, HTTPError } from "../../utils/errors.js";
import { getMimeType } from "../../utils/filetypes.js";
import { getVfs, getUser } from "../../utils/locals.js";
import uid, { Uid } from "../../utils/uid.js";
import { once } from "events";
import { Readable } from "stream";
import { finished, pipeline } from "stream/promises";


interface ImportResults {
  fail:string[];
  ok:string[];
}


export default async function postScenes(req :Request, res :Response){
  let vfs = getVfs(req);
  let requester = getUser(req);
  
  if(req.is("multipart") || req.is("application/x-www-form-urlencoded")){
    throw new BadRequestError(`Form data is not supported on this route. Provide a raw Zip attachment`);
  }

  let file_name = uid(12)+".zip";
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
      const pathParts = record.fileName.split("/").filter(p=>!!p);
      if(pathParts[0] == "scenes") pathParts.shift();
      if(pathParts.length === 0) return; //Skip "scenes/"
      const scene = pathParts.shift();
      const name = pathParts.join("/");
      if(!record.fileName.endsWith("/")) pathParts.pop();//Drop the file name unless it's a directory

      if(!scene){
        console.log("Not matching on ", record);
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
        rs.on("data", (chunk)=>{
          chunk.copy(data, size);
          size += chunk.length;
        });
        await finished(rs);
        await vfs.writeDoc(data, {scene, user_id: requester.uid, name, mime: "application/si-dpo-3d.document+json"});
      }else{
        //Add the file
        let rs = await openZipEntry(record);
        await vfs.writeFile(rs, {user_id: requester.uid, scene, name, mime: getMimeType(name)});
      }
      
      results.ok.push(`${scene}/${name}`);
    };

    zip.on("entry", (record)=>{
      onEntry(record).then(()=>{
        zip.readEntry()
      }, (e)=>{
        console.log("unzip error :", e);
        results.fail.push(`Unzip error : ${e.message}`);
        zip.close();
      });
    });
    zip.readEntry();
    await once(zip, "close");
  }).finally(() => fs.rm(tmpfile, {force: true}));

  res.status(results.fail.length? 500:200).send(results);
};