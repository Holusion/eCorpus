import { Request, Response } from "express";
import { getVfs } from "../../../utils/locals.js";
import { BadRequestError, NotFoundError } from "../../../utils/errors.js";
import { pipeline } from "stream/promises";
import { Readable } from "stream";



export async function handleShowFile(req: Request, res: Response){
  let vfs = getVfs(req);
  let {scene: sceneName, id, name} = req.params;
  let scene = await vfs.getScene(sceneName);
  let file = await vfs.getFileBefore({scene: scene.id, name, before: parseInt(id)});
  if(!file.hash && !file.data) throw new NotFoundError(`${sceneName}/${ name } does not exist at this reference point`);
  if(file.hash === "directory") throw new BadRequestError(`${sceneName}/${name} appears to be a directory`);
  let rs = file.data? Readable.from([Buffer.from(file.data)]): (await vfs.openFile({hash: file.hash!})).createReadStream({ });
  
  res.set("Content-Length", file.size.toString(10));
  res.set("Accept-Ranges", "bytes");

  res.set("ETag", `W/${file.hash}`);
  res.set("Last-Modified", file.mtime.toUTCString());
  if(req.fresh){
    rs.destroy();
    return res.status(304).send("Not Modified");
  }
  res.set("Content-Type", file.mime);
  res.status(200);
  try{
    await pipeline(
      rs,
      res,
    );
  }catch(e){
    if((e as any).code != "ERR_STREAM_PREMATURE_CLOSE") throw e;
  }
}