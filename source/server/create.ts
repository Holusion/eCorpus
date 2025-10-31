import util, { debuglog } from "node:util";

import type express from "express";


import UserManager from "./auth/UserManager.js";
import { mkdir } from "fs/promises";

import openDatabase from "./vfs/helpers/db.js";
import Vfs from "./vfs/index.js";
import defaultConfig from "./utils/config.js";
import createServer from "./routes/index.js";
import { Client } from "pg";
import { TaskProcessor } from "./tasks/processor.js";
import { TaskScheduler } from "./tasks/scheduler.js";


const debug = debuglog("pg:connect");

export interface Services{
  app: express.Application;
  vfs: Vfs;
  userManager: UserManager;
  close: ()=>Promise<void>;
}

export default async function createService(config = defaultConfig) :Promise<Services>{

  await Promise.all([config.files_dir].map(d=>mkdir(d, {recursive: true})));
  let db = await openDatabase({uri: config.database_uri, forceMigration: config.force_migration});
  let uri = new URL(config.database_uri);
  debug(`Connected to database ${uri.hostname}:${uri.port}${uri.pathname}`)
  const vfs = await Vfs.Open(config.files_dir, {db});
  const userManager = new UserManager(db);

  const client = new Client({connectionString: config.database_uri});
  await client.connect();
  
  const taskProcessor = new TaskProcessor({client, vfs, userManager, config});
  const taskScheduler = new TaskScheduler({client});

  await Promise.all([
    taskProcessor.start(),
    taskScheduler.start(),
  ]);


  if(config.clean_database){
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
    fileDir: config.files_dir,
    vfs,
    config,
    taskScheduler,
  });

  return {
    app,
    vfs,
    userManager,
    async close(){
      await Promise.all([
        taskProcessor.stop(),
        taskScheduler.stop(),
      ]);
      await Promise.all([
        vfs.close(),
        client.end(),
      ]);
    }
  };
}
