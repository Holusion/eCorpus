

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database } from "../vfs/helpers/db.js";

import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import { TaskManager } from "./manager.js";

describe("TaskManager", function(){
  let db_uri: string, scene_id: number, handle: Database, client: Client;

    let listener :TaskManager;
  this.beforeAll(async function(){
    db_uri = await getUniqueDb(this.currentTest?.title.replace(/[^\w]/g, "_"));
    handle = await openDatabase({uri: db_uri});
    let s = await handle.get(
      "INSERT INTO scenes(scene_id, scene_name) VALUES ( $1, $2 ) RETURNING scene_id",
    [Uid.make(), randomBytes(8).toString("base64url")]);
    scene_id = s.scene_id;
  });

  this.afterAll(async function(){
    await handle?.end();
    await dropDb(db_uri);
  });

  this.beforeEach(async function(){
    await Promise.all([
      handle.run(`DELETE FROM tasks`),
      handle.run(`DELETE FROM tasks_logs`),
    ]);
    
    listener = new TaskManager(handle);
  })


  //Non-connected functions that should work well in isolation
  it("create tasks", async function(){
    let task = await listener.create({
      scene_id, 
      user_id: null,
      type: "delayTask",
      data: {time: 0}
    });
    expect(task.task_id).to.be.a("number");
    expect(await handle.all("SELECT * FROM tasks")).to.have.length(1);
  });


  it("update task status", async function(){
    let t = await listener.create({
      scene_id,
      user_id: null, 
      type: "delayTask",
      data: {time: 0}
    });
    expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "pending");
    await listener.setTaskStatus(t.task_id, "success");
    expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "success");
  });

  it("get a task", async function(){
    //Create a task
    let t = await listener.create({
      scene_id,
      user_id: null, 
      type: "delayTask",
      data: {time: 0}
    });
    
    let resolved = await listener.getTask(t.task_id);
    expect(resolved).to.deep.equal(t);
  });
  
});