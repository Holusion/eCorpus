
import os from "os";
import BaseVfs from "./Base.js";
import config from "../utils/config.js";

interface ServerStats{
  usage: {
    mtime: Date,
  },
  data: {
    size :number,
    scenes :number,
  },
  process: {
    freemem :number,
    load :[number, number, number],
    cores :number
  },
  build: {
    ref: string|"unknown",
    migration_id: string,
  }
}

export default abstract class StatsVfs extends BaseVfs{
  async getStats() :Promise<ServerStats>{
    let mtime = new Date((await this.db.all<{mtime:string}>(`
      SELECT MAX(ctime) AS mtime FROM files LIMIT 1;
    `))[0]?.mtime ?? 0);

    let {size} = (await this.db.all<{size:number}>(`
      SELECT SUM(size) AS size
      FROM (
        SELECT MAX(size) AS size, hash
        FROM files 
        GROUP BY hash
      ) as distinct_files
      LIMIT 1
    `))[0] ?? {size: 0};
    
    let {scenes} = (await this.db.all(`SELECT COUNT(scene_name) AS scenes FROM scenes LIMIT 1`))[0];

    let {id: migration_id} = (await this.db.all("SELECT MAX(id) AS id FROM migrations LIMIT 1"))[0];
    return {
      usage: {mtime},
      data: {size, scenes},
      process:{
        freemem: os.freemem(),
        load: os.loadavg() as ServerStats["process"]["load"],
        cores: os.cpus().length
      },
      build: {
        ref: config.build_ref,
        migration_id: migration_id.toString(10).padStart(3, "0"),
      }
    };
  }
}