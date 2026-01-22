

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database } from "../vfs/helpers/db.js";

import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import { TaskManager } from "./manager.js";
import Vfs from "../vfs/index.js";
import UserManager from "../auth/UserManager.js";

describe("TaskManager", function(){
  let db_uri: string, scene_id: number, user_id: number, handle: Database;

    let listener :TaskManager;
  this.beforeAll(async function(){
    db_uri = await getUniqueDb(this.currentTest?.title.replace(/[^\w]/g, "_"));
    handle = await openDatabase({uri: db_uri});
    const vfs = new Vfs("/dev/null", handle);
    scene_id = await vfs.createScene(randomBytes(8).toString("base64url"));
    const userManager = new UserManager(handle);
    user_id = (await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"))).uid;
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
      scene_id: null, 
      user_id: null,
      type: "delayTask",
      data: {time: 0}
    });
    expect(task.task_id).to.be.a("number");
    expect(await handle.all("SELECT * FROM tasks")).to.have.length(1);
  });
  
  it("create a task attached to a scene", async function(){
    let task = await listener.create({
      scene_id, 
      user_id: null,
      type: "delayTask",
      data: {time: 0}
    });
    expect(task.task_id).to.be.a("number");
    expect(task.scene_id).to.equal(scene_id);
  })
  
  it("create a task attached to a user", async function(){
    let task = await listener.create({
      scene_id: null, 
      user_id,
      type: "delayTask",
      data: {time: 0}
    });
    expect(task.task_id).to.be.a("number");
    expect(task.user_id).to.equal(user_id);
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

  it("creates a task with a parent", async function(){
    let parent = await listener.create({
      scene_id,
      user_id: null, 
      type: "delayTask",
      data: {time: 0}
    });

    let child = await listener.create({
      scene_id,
      user_id: null, 
      type: "delayTask",
      data: {time: 0},
      parent: parent.task_id,
    });

    expect(child).to.have.property("parent", parent.task_id);
  });
  
});