
import os from "os";
import BaseVfs from "./Base.js";

interface ServerStats{
  files: {
    mtime :Date,
    size :number,
    scenes :number,
    files :number
  };
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
      FROM files
      GROUP BY hash
    `)) ?? {size: 0};

    let {scenes} = await this.db.get(`SELECT COUNT(scene_name) AS scenes FROM scenes`);

    let {files} = await this.db.get<{files:number}>(`
        SELECT COUNT (name) AS files
        FROM files
        GROUP BY name
    `) ?? {files: 0};

    return {
      files:{mtime, size, scenes, files},
      process:{
        freemem: os.freemem(),
        load: os.loadavg() as ServerStats["process"]["load"],
        cores: os.cpus().length
      }
    };
  }
}