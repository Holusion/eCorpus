

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database, DatabaseHandle } from "../vfs/helpers/db.js";

import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import { TaskScheduler } from "./scheduler.js";

describe("TaskScheduler", function(){
  let db_uri: string, scene_id: number, handle: Database, client: Client;

  //Create a taskScheduler with minimal context
  let scheduler :TaskScheduler<{db:DatabaseHandle}>;
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
    
    scheduler = new TaskScheduler({db: handle});
  })
  this.afterEach(async function(){
    await scheduler.close();
  });

  it("creates an immediately-executed task", async function(){
    const result = await scheduler.run({
      scene_id: null,
      user_id: null,
      type: "testTask",
      data: {},
      handler: async ({task})=>{
        return task.task_id;
      }
    });
    expect(result).to.be.a("number");

    const task = await scheduler.getTask(result);
    expect(task).to.have.property("status", "success");
    expect(task).to.have.property("output", result);
  });

  it("initialized a task for later execution", async function(){
    let task = await scheduler.create({
      scene_id: null,
      user_id: null,
      type: "testTask",
      data: {},
    });
    const output = await scheduler.run({task, handler: async ({task})=> task.task_id});
    expect(output).to.equal(task.task_id);

    task = await scheduler.getTask(output);
    expect(task).to.have.property("status", "success");
    expect(task).to.have.property("output", output);
  });

  it("handles tasks errors", async function(){
    let id_ref :number;
    await expect(scheduler.run({
      scene_id: null,
      user_id: null,
      type: "testTask",
      data: {},
      handler: async ({task})=>{
        id_ref = task.task_id;
        await Promise.reject(new Error("Some message"));
      }
    })).to.be.rejectedWith("Some message");

    expect(id_ref!).to.be.a("number");

    const task = await scheduler.getTask(id_ref!);
    expect(task).to.have.property("status", "error");
    expect(task).to.have.property("output").ok;
  });

  it("use a named function for task type", async function(){
    const result = await scheduler.run({
      scene_id: null,
      user_id: null,
      data: {},
      handler: async function testTask({task}){
        return task.task_id;
      }
    });
    expect(result).to.be.a("number");

    const task = await scheduler.getTask(result);
    expect(task).to.have.property("status", "success");
    expect(task).to.have.property("type", "testTask");
  });
  
});