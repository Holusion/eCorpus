
import os from "os";
import BaseVfs from "./Base.js";

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
  }
}

export default abstract class StatsVfs extends BaseVfs{
  async getStats() :Promise<ServerStats>{
    let mtime = new Date((await this.db.get<{mtime:string}>(`
      SELECT MAX(ctime) AS mtime FROM files;
    `))?.mtime ?? 0);

    let {size} = (await this.db.get<{size:number}>(`
      SELECT SUM(size) AS size
      FROM (
        SELECT MAX(size) AS size, hash
        FROM files 
        GROUP BY hash
      ) as distinct_files
    `)) ?? {size: 0};
    
    let {scenes} = await this.db.get(`SELECT COUNT(scene_name) AS scenes FROM scenes`);


    return {
      usage: {mtime},
      data: {size, scenes},
      process:{
        freemem: os.freemem(),
        load: os.loadavg() as ServerStats["process"]["load"],
        cores: os.cpus().length
      }
    };
  }
}