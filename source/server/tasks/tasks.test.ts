

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
    await handle.run(`DELETE FROM tasks_relations`);
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
      expect(task).to.be.a("number");
      expect(await handle.all("SELECT * FROM tasks")).to.have.length(1);
    });


    it("update task status", async function(){
      let t = await listener.create(scene_id, {type: "delayTask", data: {time: 0}});
      expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "pending");
      await listener.setTaskStatus(t, "success");
      expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "success");
    });

    it("resolve task", async function(){
      //Create a task with a parent
      let t1 = await listener.create(scene_id, {type: "delayTask", data: {time: 0}});
      let t2 = await listener.create(scene_id, {type: "delayTask", data: {time: 0}, after: [t1]});
      
      let resolved = await listener.getTask(t2);
      expect(resolved.after).to.deep.equal([t1]);
    });
  });



  describe("scheduler", function(){
    let scheduler: TaskScheduler;

    this.beforeEach(async function(){
      scheduler = new TaskScheduler({client});
      await scheduler.start()
    });

    this.afterEach(async function(){
      if(scheduler.started) scheduler.stop();
    });

    it("can create tasks", async function(){
      await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}});
      let tasks = await handle.all(`SELECT * FROM tasks`);
      expect(tasks).to.have.property("length", 1);
    });

    it("can create \"after\" relations", async function(){
      let requirements = [
         await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}}),
        await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}})
      ]
      let after = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}, after: requirements});

      expect(await scheduler.getTask(after)).to.have.property("after").to.deep.equal( requirements);
    });

    it("can nest relations", async function(){
      let t1 = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}});
      let t2 = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}, after: [t1]});
      let t3 = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}, after: [t1, t2]});
      let t4 = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}, after: [t3]});
    });

    it("can't cycle relations", async function(){
      let t1 = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}});
      let t2 = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}, after: [t1]});
      await expect(scheduler.addRelation(t2, t1)).to.be.rejectedWith("check_no_cycles");
    });

    it("can create tasks with asynchronous initialization", async function(){
      await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}, status: 'initializing'});
      let tasks = await handle.all(`SELECT * FROM tasks`);
      expect(tasks).to.have.property("length", 1);
      expect(tasks[0]).to.have.property("status", "initializing");
    });
  });


  describe("processor", function(){
    let processor: TaskProcessor, scheduler: TaskScheduler;

    this.beforeEach(async function(){
      processor = new TaskProcessor({client, vfs: null as any, userManager: null as any}); 
      scheduler = new TaskScheduler({client});
      await Promise.all([processor.start(), scheduler.start()])
    });

    this.afterEach(async function(){
      if(processor.started) processor.stop();
      if(scheduler.started) scheduler.stop();
    });


    it("can take tasks", async function(){

      let t = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}});
      let [task_id] = await once(scheduler, "success");
      expect(task_id).to.equal(t);
    });

    it("can wait for tasks", async function(){

      let t = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}});

      await scheduler.wait(t);
    });

    it("can wait for task to fail", async function(){
      let t = await scheduler.create(scene_id, {type: "evalTask", data: {x: `() =>{throw new Error("Some error")}`}});
      await expect(scheduler.wait(t)).to.be.rejectedWith("Some error");
    });

    it("will take all available tasks", async function(){
      let tasks = [];
      for(let i = 0; i < 4; i++){
        tasks.push(await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}}));
      }

      await Promise.all(tasks.map(t=> scheduler.wait(t)));

      let allTasks = await handle.all(`SELECT * FROM tasks`);
      expect(Array.from(new Set(allTasks.map(t=>t.status)))).to.deep.equal(["success"]);
    });

    it("catch errors if the scene is deleted in-flight", async function(){
      let s2 = await handle.get(
        "INSERT INTO scenes(scene_id, scene_name) VALUES ( $1, $2 ) RETURNING scene_id",
      [Uid.make(), randomBytes(8).toString("base64url")]);

      let  t = await scheduler.create(s2.scene_id, {type: "delayTask", data: {time: 10}});
      
      await handle.run(`DELETE FROM scenes WHERE scene_id = $1`, [s2.scene_id]);

      await expect(scheduler.wait(t)).to.be.rejectedWith("[404] No task found with id");
    });

    it("catch errors if the scene is deleted in-flight (with relations)", async function(){
      let s2 = await handle.get(
        "INSERT INTO scenes(scene_id, scene_name) VALUES ( $1, $2 ) RETURNING scene_id",
      [Uid.make(), randomBytes(8).toString("base64url")]);

      let  t = await scheduler.create(s2.scene_id, {type: "delayTask", data: {time: 10}});
      let  t2 = await scheduler.create(s2.scene_id, {type: "delayTask", data: {time: 10}, after: [t]});
      
      await handle.run(`DELETE FROM scenes WHERE scene_id = $1`, [s2.scene_id]);

      await expect(scheduler.wait(t)).to.be.rejectedWith("[404] No task found with id");
    });
  })

  describe("multi processor", function(){
    // Tests task processing parallelism. Since task processor has no built-in parallelism, we rely on multiple instances
    let processors: TaskProcessor[] =[], scheduler: TaskScheduler;

    this.beforeEach(async function(){
      processors =[];
      for(let i = 0; i < 4; i++){
        processors.push(new TaskProcessor({client, vfs: null as any, userManager: null as any}))
      }
      scheduler = new TaskScheduler({client});
      await Promise.all([...processors.map(p=>p.start()), scheduler.start()])
    });

    this.afterEach(async function(){
      processors.forEach(processor=>processor.stop());
      if(scheduler.started) scheduler.stop();
    });

    it("can respect tasks ordering", async function(){
      let parent = await scheduler.create(scene_id, {type: "delayTask", data: {time: 0}});
      let before = await scheduler.create(scene_id, parent, {type: "delayTask", data: {time: 25}});
      let after = await scheduler.create(scene_id, parent, {type: "delayTask", data: {time: 10}, after:[before]});
      
      let results:number[] = [];
      await Promise.all([parent, before, after].map(async task=>{
        await scheduler.wait(task);
        results.push(task);
      }));
      expect(results).to.deep.equal([parent, before, after].map(t=>t));
    });
  });

  describe("control tasks", function(){
    // Tests task processing parallelism. Since task processor has no built-in parallelism, we rely on multiple instances
    let processors: TaskProcessor[] =[], scheduler: TaskScheduler;

    this.beforeEach(async function(){
      processors =[];
      for(let i = 0; i < 1; i++){
        processors.push(new TaskProcessor({client, vfs: null as any, userManager: null as any}))
      }
      scheduler = new TaskScheduler({client});
      await Promise.all([...processors.map(p=>p.start()), scheduler.start()])
    });

    this.afterEach(async function(){
      processors.forEach(processor=>processor.stop());
      if(scheduler.started) scheduler.stop();
    });


    //Tasks

    describe("evalTask", function(){
      it("can execute arbitrary code", async function(){
        let t = await scheduler.create(scene_id, {type: "evalTask", data: {x: `()=> 'foo'`}});
        let result = await scheduler.wait(t);
        expect(result).to.equal("foo");
      });
    });
    
    describe("group tasks", function(){

      it("with TaskListener.group()- array", async function(){
        let group = await scheduler.group(scene_id, async (tasks)=>{
          return [
            await tasks.create({type: "delayTask", data: {time: 5, value: 'a'}}),
            await tasks.create({type: "delayTask", data: {time: 0, value: 'b'}}),
          ];
        });
        let results = await scheduler.wait(group);
        expect(results).to.deep.equal(['a', 'b']);
      });

      it("with TaskListener.group()- generator", async function(){
        let group = await scheduler.group(scene_id, async function* (tasks){
            yield await tasks.create({type: "delayTask", data: {time: 5, value: 'a'}});
            yield await tasks.create({type: "delayTask", data: {time: 0, value: 'b'}});
        });
        let results = await scheduler.wait(group);
        expect(results).to.deep.equal(['a', 'b']);
      });

      it("nested groups", async function(){
        let group = await scheduler.group(scene_id, async function* (tasks){
          yield await tasks.group(async function*(tasks){
            yield await tasks.create({type: "delayTask", data: {time: 0, value: 'a'}});
            yield await tasks.create({type: "delayTask", data: {time: 0, value: 'b'}});
          });
        });
        let results = await scheduler.wait(group);
        expect(results).to.deep.equal([['a', 'b']]);
      });
    });
  });
});