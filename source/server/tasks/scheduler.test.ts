

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation
import timers from "timers/promises";
import { Client } from "pg";
import openDatabase, { Database, DatabaseHandle } from "../vfs/helpers/db.js";

import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import { TaskScheduler } from "./scheduler.js";
import { CreateRunTaskParams, TaskDefinition } from "./types.js";
import Vfs from "../vfs/index.js";
import UserManager from "../auth/UserManager.js";


const makeTask = (props:Partial<CreateRunTaskParams<any,unknown,{}>> = {})=>({
      scene_id: null, user_id: null, data: {},
      handler: ()=>Promise.resolve(),
      ...props,
    })

describe("TaskScheduler", function(){
  let db_uri: string, scene_id: number, user_id: number, handle: Database, client: Client;

  //Create a taskScheduler with minimal context
  let scheduler :TaskScheduler<{db:DatabaseHandle}>;
  this.beforeAll(async function(){
    db_uri = await getUniqueDb(this.currentTest?.title.replace(/[^\w]/g, "_"));
    handle = await openDatabase({uri: db_uri});
    const vfs = new Vfs("/dev/null", handle);
    scene_id = await vfs.createScene(randomBytes(8).toString("base64url"));

    const userManager = new UserManager(handle);
    const user = await userManager.addUser("alice", "12345678", "admin");
    user_id = user.uid;
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

  it("data is never null inside a task", async function(){
    let ok = false;
    await scheduler.run(makeTask({handler: ({task})=>{
      expect(task).to.have.property("data").an("object");
      ok = true;
    }}));
    expect(ok, `Task seems to not have been run`).to.be.true;
  });

  it("won't deadlock itself", async function(){
    scheduler.concurrency = 2;

    let tasks = [];
    for(let i = 0; i < 4; i++){
      tasks.push(scheduler.run(makeTask({handler: async ()=>{
        await timers.setTimeout(1);
         await scheduler.run(makeTask());
      }})));
    }
    await Promise.all(tasks);
  });

  it("nested tasks get their parent's attributes", async function(){
    let children:Array<TaskDefinition> = [];
    const parent_id = await scheduler.run(makeTask({
      scene_id,
      user_id,
      handler: async function({task, context:{tasks}}){
        //Using context object. We don't specify
        await tasks.run(makeTask({handler: async ({task})=>{
          children.push(task);
        }}));

        //Using external "scheduler", works as well thanks to the asyncStorage mechanism
        await scheduler.run(makeTask({handler: async ({task})=>{
          children.push(task);
        }}));

        return task.task_id;
      }
    }));
    expect(parent_id).to.be.a("number");
    expect(children).to.have.length(2);
    for(let i = 0; i < children.length; i++){
      const child = children[i];
      expect(child).to.have.property("parent", parent_id);
      expect(child).to.have.property("scene_id", scene_id);
      expect(child).to.have.property("user_id", user_id);
    }
  });
  
});