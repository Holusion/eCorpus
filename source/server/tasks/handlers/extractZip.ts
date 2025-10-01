import { Readable } from "node:stream";
import { once } from "node:events";
import { TaskHandlerParams } from "../types.js";
import yauzl, { Entry, ZipFile } from "yauzl";



interface ExtractZipParams{
  filepath: string,
}
/**
 * Analyze an uploaded file and create child tasks accordingly
 */
export default async function handleExtractZipFile({task: {fk_scene_id:scene_id, data:{filepath}}, signal, context:{vfs}}:TaskHandlerParams<ExtractZipParams>){
    
  let zipError: Error;
  let zip = await new Promise<ZipFile>((resolve,reject)=>yauzl.open(filepath, {lazyEntries: true, autoClose: true}, (err, zip)=>(err?reject(err): resolve(zip))));
  const openZipEntry = (record:Entry)=> new Promise<Readable>((resolve, reject)=>zip.openReadStream(record, (err, rs)=>(err?reject(err): resolve(rs))));
  

  const onEntry = async (record :Entry) =>{
    //Handle file
  };

  zip.on("entry", (record)=>{
    onEntry(record).then(()=>{
      zip.readEntry()
    }, (e)=>{
      zip.close();
      zipError=e;
    });
  });

  zip.readEntry();
  await once(zip, "close");

};
