
import { Request, Response } from "express";
import path from "path";
import { once } from "events";

import { HTTPError } from "../../../utils/errors.js";
import { getVfs, getUserId } from "../../../utils/locals.js";
import { wrapFormat } from "../../../utils/wrapAsync.js";
import { ZipEntry, zip } from "../../../utils/zip/index.js";
import Vfs from "../../../vfs/index.js";




export default async function getScene(req :Request, res :Response){
  let vfs = getVfs(req);
  let {scene} = req.params;
  let {id, mtime} = await vfs.getScene(scene);
  await wrapFormat(res, {
    "application/json": async ()=>{
      let requester = getUserId(req);
      let data = await vfs.getScene(scene, requester);
      res.status(200).send(data);
    },
    "application/zip": async ()=>{
      
      async function *getFiles(tr:Vfs) :AsyncGenerator<ZipEntry, any, unknown>{
        
        let files = await tr.listFiles(id, false, true);

        yield {
          filename: scene,
          isDirectory: true,
          mtime,
        }

        for(let file of files){
          let f = await tr.getFile({scene: id, name: file.name});
          yield {
            filename: path.join(scene, f.name),
            mtime: f.mtime,
            isDirectory: f.mime == "text/directory",
            stream: f.stream,
          }
        }
      }

      res.status(200);

      await vfs.isolate(async (tr)=>{
        for await (let data of zip(getFiles(tr))){
          let again = res.write(data);
          if(!again) await once(res, "drain");
        }
      });
      res.end();
    }
  });
};
