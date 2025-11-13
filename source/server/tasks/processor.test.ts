
// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { TaskProcessor } from "./processor.js";
import { TaskScheduler } from "./scheduler.js";
import { once } from "node:events";
import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import { NotFoundError } from "../utils/errors.js";

// So it's mostly integration tests
describe("TaskProcessor", function(){
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
    client = new Client({connectionString: db_uri});
    await client.connect();
  })

  this.afterEach(async function(){
    await client.end();
    await handle.run(`DELETE FROM tasks_relations`);
    await Promise.all([
      handle.run(`DELETE FROM tasks`),
      handle.run(`DELETE FROM tasks_logs`),
    ]);
  });


  describe("single-processor", function(){
    let processor: TaskProcessor, scheduler: TaskScheduler;

    this.beforeEach(async function(){
      processor = new TaskProcessor({client} as any); 
      scheduler = new TaskScheduler({client});
      await Promise.all([processor.start(), scheduler.start()])
    });

    this.afterEach(async function(){
      if(processor.started) processor.stop();
      if(scheduler.started) scheduler.stop();
    });


    it("can take tasks", async function(){

      let t = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}});
      let [task_id, status] = await once(scheduler, "update");
      expect(task_id).to.equal(t);
      expect(status).to.equal("success");
    });

    it("can wait for tasks", async function(){

      let t = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}});

      await scheduler.wait(t);
    });

    it("can wait for task to fail", async function(){
      let t = await scheduler.create(scene_id, null,  {type: "evalTask", data: {x: `() =>{throw new Error("Some error")}`}});
      await expect(scheduler.wait(t)).to.be.rejectedWith("Some error");
    });

    it("will take all available tasks", async function(){
      let tasks = [];
      for(let i = 0; i < 4; i++){
        tasks.push(await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}}));
      }

      await Promise.all(tasks.map(t=> scheduler.wait(t)));

      let allTasks = await handle.all(`SELECT * FROM tasks`);
      expect(Array.from(new Set(allTasks.map(t=>t.status)))).to.deep.equal(["success"]);
    });

    it("catch errors if the scene is deleted in-flight", async function(){
      let s2 = await handle.get(
        "INSERT INTO scenes(scene_id, scene_name) VALUES ( $1, $2 ) RETURNING scene_id",
      [Uid.make(), randomBytes(8).toString("base64url")]);

      let  t = await scheduler.create(s2.scene_id, null,  {type: "delayTask", data: {time: 10}});
      
      await handle.run(`DELETE FROM scenes WHERE scene_id = $1`, [s2.scene_id]);

      await expect(scheduler.wait(t)).to.be.rejectedWith("[404] No task found with id");
    });

    it("catch errors if the scene is deleted in-flight (with relations)", async function(){
      let s2 = await handle.get(
        "INSERT INTO scenes(scene_id, scene_name) VALUES ( $1, $2 ) RETURNING scene_id",
      [Uid.make(), randomBytes(8).toString("base64url")]);

      let  t = await scheduler.create(s2.scene_id, null,  {type: "delayTask", data: {time: 10}});
      let  t2 = await scheduler.createChild(t,  {type: "delayTask", data: {time: 10}, after: [t]});
      
      await handle.run(`DELETE FROM scenes WHERE scene_id = $1`, [s2.scene_id]);

      await expect(scheduler.wait(t)).to.be.rejectedWith("[404] No task found with id");
    });

    it("can't take tasks that have pending requirements", async function(){
      for(let i =0; i <2; i++){
        const parent =  await scheduler.create(scene_id, null, {type:"groupOutputsTask", data:{}});
        let deps = [], res = [];
        for(let j = 0; j < 2; j++){
          const t = j*10;
          res.push(`${t}ms`);
          deps.push(await scheduler.createChild(parent, {type: "delayTask", data: {time: t, value:`${t}ms`}}));
        }

        const after = await scheduler.createChild(parent, {type: "groupOutputsTask", data: {}, after: deps });
        
        const output = await scheduler.wait(after);
        expect(output).to.deep.equal(res);
      }
    });
  })

  describe("multi processor", function(){
    // Tests task processing parallelism. Since task processor has no built-in parallelism, we rely on multiple instances
    let processors: TaskProcessor[] =[], scheduler: TaskScheduler;

    this.beforeEach(async function(){
      processors =[];
      for(let i = 0; i < 4; i++){
        processors.push(new TaskProcessor({client} as any))
      }
      scheduler = new TaskScheduler({client});
      await Promise.all([...processors.map(p=>p.start()), scheduler.start()])
    });

    this.afterEach(async function(){
      processors.forEach(processor=>processor.stop());
      if(scheduler.started) scheduler.stop();
    });

    it("can respect tasks ordering", async function(){
      let parent = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}});
      let before = await scheduler.createChild( parent, {type: "delayTask", data: {time: 25}});
      let after = await scheduler.createChild( parent, {type: "delayTask", data: {time: 10}, after:[before]});
      
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
        processors.push(new TaskProcessor({client} as any))
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
        let t = await scheduler.create(scene_id, null,  {type: "evalTask", data: {x: `()=> 'foo'`}});
        let result = await scheduler.wait(t);
        expect(result).to.equal("foo");
      });
    });
    
    describe("group tasks", function(){
      let group_id: number;
      this.beforeEach(async function(){
        group_id = await scheduler.create(scene_id, null, {type: "delayTask", data:{time: 0}});
      });


      it("with TaskListener.group()- array", async function(){
        let group = await scheduler.group(group_id, async (tasks)=>{
          return [
            await tasks.create({type: "delayTask", data: {time: 1, value: 'a'}}),
            await tasks.create({type: "delayTask", data: {time: 0, value: 'b'}}),
          ];
        });
        let results = await scheduler.wait(group);
        expect(results).to.deep.equal(['a', 'b']);
      });

      it("with TaskListener.group()- generator", async function(){
        let group = await scheduler.group(group_id, async function* (tasks){
            yield await tasks.create({type: "delayTask", data: {time: 1, value: 'a'}});
            yield await tasks.create({type: "delayTask", data: {time: 0, value: 'b'}});
        });
        let results = await scheduler.wait(group);
        expect(results).to.deep.equal(['a', 'b']);
      });

      it("nested groups", async function(){
        let group = await scheduler.group(group_id, async function* (tasks){
          yield await tasks.group(async function*(tasks){
            yield await tasks.create({type: "delayTask", data: {time: 0, value: 'a'}});
            yield await tasks.create({type: "delayTask", data: {time: 0, value: 'b'}});
          });
        });
        let results = await scheduler.wait(group);
        expect(results).to.deep.equal([['a', 'b']]);
      });

      it("creates an empty group", async function(){
        let group = await scheduler.group(group_id, async function* (tasks){ });
        let results = await scheduler.wait(group);
        expect(results).to.deep.equal([]);
      });

      it("requires a valid task_id", async function(){
        await expect(scheduler.group(scene_id, async function* (tasks){ })).to.be.rejectedWith(NotFoundError);
      });
    });
  });
});
