import fs from "fs/promises";
import timers from "timers/promises";
import {constants} from "fs";
import BaseVfs from "./Base.js";
import FilesVfs from "./Files.js";



export default abstract class CleanVfs extends BaseVfs{
  /**
   * performs routine cleanup tasks
   * A reasonable delay is added where necessary to ensure the server can continue running properly
   */
  public async clean(){
    let cleanups = [
      this.cleanLooseObjects,
      this.checkForMissingObjects,
    ];
    for (let fn of cleanups){
      await fn.call(this);
      await timers.setTimeout(600 + Math.random()*1000);
    }
  }

  protected async cleanLooseObjects(){
    let it = await fs.opendir(this.objectsDir);
    let loose = [];
    for await (let object of it){
        let row = await this.db.get(`SELECT COUNT(file_id) AS count FROM files WHERE hash = $name`, {$name:object.name});
        if(!row || row.count == 0 ){
            loose.push(object.name);
        }
    }
    //Loose objects are OK : wan may delete scenes which will remove all history
    if(loose.length)console.log("Cleaning %d loose objects", loose.length);
    for(let object of loose){
      fs.unlink(this.filepath(object));
    }
  }

  public async optimize(){
    await this.db.exec(`
      PRAGMA optimize;
      PRAGMA wal_checkpoint(PASSIVE);
    `);
  }

  /**
   * Utility function used mainly for debugging to check if some objects are referenced but not present on disk
   */
  protected async checkForMissingObjects(){
    let objects = await this.db.all(`SELECT DISTINCT hash AS hash FROM files WHERE data IS NULL`);
    let missing = 0;
    for(let object of objects){
      if(object.hash === "directory" || object.hash === null) continue;
      try{
        await fs.access(this.filepath(object), constants.R_OK)
      }catch(e){
        missing++;
        console.log("Data :", object.data);
        console.error(`File ${object.hash} can not be read on disk`);
      }
    }
    if(missing)console.error("found %d missing objects (can't fix)", missing);
  }

  public async fillHashes(){
    let {createHash} = await import("crypto");
    let changes:Array<[number, string]> = [];
    await this.db.each<{data:string, file_id: number}>(`SELECT data, file_id FROM files WHERE data IS NOT NULL AND hash IS NULL`, (err, {data, file_id})=>{
      if(err) throw new Error(`There was an error iterating over documents  that does not have a hash :${err.message}`);
      let hashsum = createHash("sha256");
      hashsum.update(data);
      changes.push([file_id, hashsum.digest("base64url")]);
    });
    for(let [id, hash] of changes){
      console.log("fill-in hash for document %d", id);
      await this.db.run("UPDATE files SET hash = $hash WHERE file_id = $id", {$hash: hash, $id: id});
      await timers.setTimeout(Math.random()*10);
    }
  }

}