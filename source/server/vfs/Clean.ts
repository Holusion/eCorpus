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
  public async clean(this:Vfs){
    await timers.setTimeout(randomInt(100));
    let result = await this.cleanLooseObjects();
    if(result) console.log(result);
    result = await this.checkForMissingObjects();
    if(result) console.error(result);
  }

  /**
   * @warning this method has a race condition where it _could_ clean an object that is unreferenced when scanning but become referenced in the meantime.
   *          This is however deemed unlikely in common usage because it only happens when scenes are deleted (not archived)
   */
  public async cleanLooseObjects(this:Vfs) :Promise<string|void>{
    let it = await fs.opendir(this.objectsDir);
    let loose = [];
    for await (let object of it){
      await timers.setTimeout(randomInt(1));
      let row = await this.db.get(`SELECT COUNT(file_id) AS count FROM files WHERE hash = $1`, [object.name]);
      if(!row || row.count == 0 ){
        //try to prevent race conditions by ensuring file is old enough
        const stat = await fs.stat(this.getPath({hash: object.name}));
        if(stat.mtime.valueOf() < Date.now() - 3600){
          loose.push(object.name);
        }
      }
    }
    //Loose objects are OK : wan may delete scenes which will remove all history but not the referenced blobs
    for(let object of loose){
      fs.unlink(this.filepath(object));
    }
    if(!loose.length) return;
    else return `Cleaned ${loose.length} loose object${1 < loose.length? "s":""}`;
  }

  public async optimize(){
    // autovacuum is enabled at the cluster level, which prevents scheduling conflicts with multiple DBs
    // the autovacuum daemon will also issue an ANALYZE query when table data has changed significantly.
  }

  /**
   * Utility function used mainly for debugging to check if some objects are referenced but not present on disk
   * It would be very concerning if it started to find results in production deployments.
   */
  public async checkForMissingObjects(){

    let missing :Array<string> = [];
    for await (let object of this.db.each<{hash: string}>(`SELECT DISTINCT hash AS hash FROM files WHERE data IS NULL`)){
      if(object.hash === "directory" || object.hash === null) continue;
      try{
        await fs.access(this.filepath(object), constants.R_OK)
      }catch(e){
        missing.push(object.hash);
      }
      await timers.setTimeout(1);
    }
    if(!missing.length) return;
    else if(missing.length < 3){
      let plural = 1 <missing.length?"s":"";
      return `File${plural} ${missing.join(", ")} can't be read on disk (can't fix). Some data have been lost!`;
    }else return `found ${missing.length} missing objects (can't fix). Some data may have been lost!`;
  }


}