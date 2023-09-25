
import { Request, Response } from "express";
import path from "path";
import { getUserId, getVfs } from "../../../../../utils/locals";
import { wrapFormat } from "../../../../../utils/wrapAsync";
import { ZipEntry, zip } from "../../../../../utils/zip";
import { HTTPError } from "../../../../../utils/errors";




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
      
      async function *getFiles() :AsyncGenerator<ZipEntry, any, unknown>{
        let files = await vfs.listFiles(id, false, true);

        yield {
          filename: scene,
          isDirectory: true,
          mtime,
        }

        for(let file of files){
          let f = await vfs.getFileProps({scene: id, name: file.name});
          let hash = f.hash;
          yield {
            filename: path.join(scene, f.name),
            mtime: f.mtime,
            isDirectory: f.mime == "text/directory",
            stream: ((typeof hash ==="string" && hash != "directory")? (await vfs.openFile({hash})).createReadStream(): undefined),
          }
        }

        try{
          let sceneDoc = await vfs.getDoc(id);
          yield {
            filename: path.join(scene, `scene.svx.json`),
            mtime: sceneDoc.mtime,
            stream: [Buffer.from(sceneDoc.data)]
          }
        }catch(e){
          if((e as HTTPError).code != 404) throw e;
          //Ignore errors if scene has no document
        }
      }

      res.status(200);
      for await (let data of zip(getFiles())){
        await new Promise<void>(resolve=>{
          let again = res.write(data);
          if(again) resolve();
          else res.once("drain", resolve);
        });
      }
      res.end();
    }
  });
};
