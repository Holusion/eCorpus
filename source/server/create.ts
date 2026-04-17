import { debuglog } from "node:util";

import type express from "express";


import UserManager from "./auth/UserManager.js";
import { mkdir } from "fs/promises";

import openDatabase from "./vfs/helpers/db.js";
import Vfs from "./vfs/index.js";
import defaultConfig, { Config, parse } from "./utils/config.js";
import createServer from "./routes/index.js";
import { TaskScheduler } from "./tasks/scheduler.js";


const debug = debuglog("pg:connect");

export interface Services{
  app: express.Application;
  vfs: Vfs;
  taskScheduler: TaskScheduler;
  userManager: UserManager;
  close: ()=>Promise<void>;
}

export default async function createService(env = process.env) :Promise<Services>{
  const {files_dir, force_migration, database_uri, clean_database} = parse(env); 
  await Promise.all([files_dir].map(d=>mkdir(d, {recursive: true})));
  let db = await openDatabase({uri: database_uri, forceMigration: force_migration});
  let uri = new URL(database_uri);
  debug(`Connected to database ${uri.hostname}:${uri.port}${uri.pathname}`);

  /**
   * When running tests, this may throw an error on singleton duplicate
   * It is generally an indication of bad or incomplete cleanup procedures.
   */
  const runtimeConfig: Config = await Config.open(db, env);

  const vfs = await Vfs.Open(files_dir, {db});
  const userManager = new UserManager(db);

  const taskScheduler = new TaskScheduler({db, vfs, userManager, config: runtimeConfig});


  if(clean_database){
    setTimeout(()=>{
      //Clean file system after a while to prevent delaying startup
      vfs.clean().then(()=>console.log("Cleanup done."), e=> console.error("Cleanup failed :", e));
    }, 6000).unref();


    setInterval(()=>{
      vfs.optimize();
    }, 2*3600*1000).unref();
  }

  const app = await createServer({
    userManager,
    fileDir: files_dir,
    vfs,
    taskScheduler,
    config: runtimeConfig,
  });

  return {
    app,
    vfs,
    userManager,
    taskScheduler,
    async close(){
      await taskScheduler.close();
      await vfs.close();
      Config.close();
    }
  };
}
