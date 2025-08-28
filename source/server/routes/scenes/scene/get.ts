
import { Request, Response } from "express";
import path from "path";
import { once } from "events";

import { getVfs, getUserId } from "../../../utils/locals.js";
import { wrapFormat } from "../../../utils/wrapAsync.js";
import yazl, { ZipFile } from "yazl";
import { compressedMime } from "../../../utils/filetypes.js";




export default async function getScene(req :Request, res :Response){
  let vfs = getVfs(req);
  let {scene} = req.params;
  await wrapFormat(res, {
    "application/json": async ()=>{
      let requester = getUserId(req);
      let data = await vfs.getScene(scene, requester);
      res.status(200).send(data);
    },
    "application/zip": async ()=>{
      let {id, mtime} = await vfs.getScene(scene);
      
      res.status(200);
      let zip = new yazl.ZipFile();
      zip.outputStream.pipe(res, {end: true});
      const op = vfs.isolate(async (tr)=>{
        for await (let file of tr.listFiles(id, { withArchives: false, withFolders: false, withData: true})){
          const metaPath = path.join("scenes", scene, file.name);
          const opts = {
            mtime: file.mtime,
            mode: 0o100664,
            compress: compressedMime(file.mime),
          };
          if(file.data){
            zip.addBuffer(Buffer.from(file.data), metaPath);
          }else{
            zip.addFile(tr.getPath({hash: file.hash}), metaPath, opts);
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
