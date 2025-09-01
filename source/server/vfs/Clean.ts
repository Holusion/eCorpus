import fs from "fs/promises";
import timers from "timers/promises";
import {constants} from "fs";
import BaseVfs from "./Base.js";
import { randomInt } from "crypto";
import Vfs from "./index.js";


/**
 * Cleaning routines. Main entrypoint should be the `clean` method
 * Each routine should have internal delays that prevents it from causing resource contention on the server
 */
export default abstract class CleanVfs extends BaseVfs{
  /**
   * performs routine cleanup tasks
   * A reasonable delay is added where necessary to ensure the server can continue running properly
   * Delays are randomized to prevent too much contention when starting multiple instances on the same server
   */
  public async clean(){
    let cleanups = [
      this.cleanLooseObjects,
      this.checkForMissingObjects,
    ];
      await timers.setTimeout(randomInt(100));
    for (let fn of cleanups){
      await fn.call(this as any as Vfs);
      await timers.setTimeout(randomInt(100, 500));
    }
  }

  /**
   * @fixme this method is known to be slightly unsafe because it _could_ clean an object that is unreferenced when scanning but become referenced before it is removed.
   */
  protected async cleanLooseObjects(this:Vfs){
    let it = await fs.opendir(this.objectsDir);
    let loose = [];
    for await (let object of it){
      await timers.setTimeout(randomInt(1));
      let row = await this.db.get(`SELECT COUNT(file_id) AS count FROM files WHERE hash = $1`, [object.name]);
      if(!row || row.count == 0 ){
        //try to prevent race conditions by ensuring file is old enough
        const stat = await fs.stat(this.getPath({hash: row.hash}));
        if(stat.mtime.valueOf() < Date.now() - 3600){
          loose.push(object.name);
        }
      }
    }
    //Loose objects are OK : wan may delete scenes which will remove all history
    if(loose.length)console.log("Cleaning %d loose objects", loose.length);
    for(let object of loose){
      fs.unlink(this.filepath(object));
    }
  }

  public async optimize(){
    // autovacuum is enabled at the cluster level, which prevents scheduling conflicts with multiple DBs
    // the autovacuum daemon will also issue an ANALYZE query when table data has changed significantly.
  }

  /**
   * Utility function used mainly for debugging to check if some objects are referenced but not present on disk
   */
  protected async checkForMissingObjects(){

    let missing = 0;
    for await (let object of this.db.each<{hash: string}>(`SELECT DISTINCT hash AS hash FROM files WHERE data IS NULL`)){
      if(object.hash === "directory" || object.hash === null) continue;
      try{
        await fs.access(this.filepath(object), constants.R_OK)
      }catch(e){
        missing++;
        console.error(`File ${object.hash} can not be read on disk`);
      }
      await timers.setTimeout(1);
    }
    if(missing)console.error("found %d missing objects (can't fix)", missing);
  }


}