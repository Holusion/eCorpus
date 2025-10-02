

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { TaskProcessor } from "./processor.js";
import { TaskScheduler } from "./scheduler.js";
import { once } from "node:events";
import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import { TaskListener } from "./listener.js";

// So it's mostly integration tests
describe("Task handling", function(){
  let db_uri: string, scene_id: number, handle: Database, client: Client;
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
    
    client = new Client({connectionString: db_uri});
    await client.connect();
  })
  this.afterEach(async function(){
    await client.end();
  });

  describe("TaskListener (common methods)", function(){
    let listener :TaskListener;

    this.beforeEach(async function(){
      listener = new TaskListener({client});
    });

    //Non-connected functions that should work well in isolation
    it("create tasks", async function(){
      let task = await listener.create(scene_id, {type: "delayTask", data: {time: 0}});
      expect(task).to.have.property("task_id").a("number");
      expect(task).to.have.property("ctime").instanceof(Date);
      expect(task).to.have.property("data").an("object");
      expect(await handle.all("SELECT * FROM tasks")).to.have.length(1);

    });


    it("update task status", async function(){
      let t = await listener.create(scene_id, {type: "delayTask", data: {time: 0}});
      expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "pending");
      await listener.setTaskStatus(t.task_id, "success");
      expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "success");
    });

    it("resolve task", async function(){
      //Create a task with a parent
      let t1 = await listener.create(scene_id, {type: "delayTask", data: {time: 0}});
      let t2 = await listener.create(scene_id, {type: "delayTask", data: {time: 0}, parent: t1.task_id});
      
      let resolved = await listener.resolveTask(t2.task_id);
      expect(resolved.parent).to.be.an("object");
      expect(resolved.parent).to.deep.equal(t1);
      expect(resolved.fk_scene_id).to.equal(t2.fk_scene_id);
    })
  });

  describe("scheduler / processor", function(){
    let processor: TaskProcessor, scheduler: TaskScheduler;

    this.beforeEach(async function(){
      processor = new TaskProcessor({client, vfs: null as any, userManager: null as any}); 
      scheduler = new TaskScheduler({client}); 
    });

    this.afterEach(async function(){
    if(processor.started) processor.stop();
    if(scheduler.started) scheduler.stop();
    });

    it("can take tasks", async function(){
      await processor.start();
      await scheduler.start();


      await handle.run("INSERT INTO tasks(fk_scene_id, type, data) VALUES ($1, $2, $3)", [scene_id, "delayTask", {time: 0}]);
      let task_id = await once(scheduler, "success");
    });
  })

});
