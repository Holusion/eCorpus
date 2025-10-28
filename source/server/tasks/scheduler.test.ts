

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { TaskScheduler } from "./scheduler.js";
import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import Vfs from "../vfs/index.js";
import UserManager from "../auth/UserManager.js";
import { TaskStatus } from "./types.js";
import { NotFoundError } from "../utils/errors.js";

// So it's mostly integration tests
describe("TaskScheduler", function(){
  let _vfs :Vfs, _userManager: UserManager;
  let db_uri: string, handle: Database, client: Client;

  let scene_name: string, scene_id: number, author:string, user_id: number

  let scheduler: TaskScheduler;
  this.beforeAll(async function(){
    db_uri = await getUniqueDb(this.currentTest?.title.replace(/[^\w]/g, "_"));
    handle = await openDatabase({uri: db_uri});
    _vfs = new Vfs("/dev/null", handle);
    _userManager = new UserManager(handle);
    scene_name = randomBytes(8).toString("base64url");
    scene_id = await _vfs.createScene(scene_name)

    author = randomBytes(4).toString("hex");
    let u = await _userManager.addUser(author, randomBytes(6).toString("base64"));
    user_id = u.uid;
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

    scheduler = new TaskScheduler({client});
    await scheduler.start()
  })
  this.afterEach(async function(){
    if(scheduler.started) await scheduler.stop();
    await client.end();
  });

  describe("create()", function(){

    it("can create tasks", async function(){
      await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}});
      let tasks = await handle.all(`SELECT * FROM tasks`);
      expect(tasks).to.have.property("length", 1);
    });

    it("can create tasks with asynchronous initialization", async function(){
      await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}, status: 'initializing'});
      let tasks = await handle.all(`SELECT * FROM tasks`);
      expect(tasks).to.have.property("length", 1);
      expect(tasks[0]).to.have.property("status", "initializing");
    });
  })

  describe("createChild()", function(){
    it("can create \"after\" relations", async function(){
      let parent = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}});
      let requirements = [
          await scheduler.createChild(parent,  {type: "delayTask", data: {time: 0}}),
        await scheduler.createChild(parent,  {type: "delayTask", data: {time: 0}})
      ]
      let after = await scheduler.createChild(parent,  {type: "delayTask", data: {time: 0}, after: requirements});

      expect(await scheduler.getTask(after)).to.have.property("after").to.deep.equal( requirements);
    });

    it("can nest relations", async function(){
      let t1 = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}});
      let t2 = await scheduler.createChild(t1,  {type: "delayTask", data: {time: 0}, after: [t1]});
      let t3 = await scheduler.createChild(t1,  {type: "delayTask", data: {time: 0}, after: [t1, t2]});
      let t4 = await scheduler.createChild(t1,  {type: "delayTask", data: {time: 0}, after: [t3]});
    });

    it("can't cycle relations", async function(){
      let parent = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}});
      let t1 = await scheduler.createChild(parent,  {type: "delayTask", data: {time: 0}, status: "initializing"});
      let t2 = await scheduler.createChild(parent,  {type: "delayTask", data: {time: 0}, after: [t1]});
      await expect(scheduler.addRelation(t2, t1)).to.be.rejectedWith("check_no_cycles");
    });
  });

  describe("getTasks()", function(){
    let parent: number, t1: number, t2: number;

    this.beforeEach(async function(){
      parent = await scheduler.create(scene_id, user_id,  {type: "delayTask", data: {time: 0}});
      t1 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}});
      t2 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}});
    });

    it("get a tasks tree", async function(){
      let now = new Date(); //Ensure consistent dates
      await handle.run(`UPDATE tasks SET ctime = $1`, [now]);
      const alltasks = await scheduler.getTasks();
      expect(alltasks).to.deep.equal([{
        scene_id,
        scene_name,
        task_id: parent,
        type: "delayTask",
        after: [],
        ctime: now,
        status: "pending",
        output: null,
        groupStatus: "pending",
        author,
        children: [
          {
            type: 'delayTask',
            ctime:  now,
            status: 'pending',
            groupStatus: "pending",
            output: null,
            task_id: t1,
            children: [],
            after: [],
          },
          {
            type: 'delayTask',
            ctime: now,
            status: 'pending',
            groupStatus: "pending",
            output: null,
            task_id: t2,
            children: [],
            after: [],
          }
        ]
      }])
    });

    it("get tasks relations", async function(){
      let t3 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}, after: [t2]});
      const alltasks = await scheduler.getTasks();
      expect(alltasks).to.have.length(1);
      expect(alltasks[0].children).to.have.length(3);
      expect(alltasks[0].children[2]).to.have.property("task_id", t3);
      expect(alltasks[0].children[2]).to.have.property("after").to.deep.equal( [t2]);
    });

    ([
      'aborting',
      'error',
      'initializing',
      'running',
    ] satisfies TaskStatus[]).forEach((status)=>{
      it(`computes group status ${status}`, async function(){
        const t3 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}, status });
        const alltasks = await scheduler.getTasks();
        expect(alltasks).to.have.length(1);
        expect(alltasks[0]).to.have.property("groupStatus", status);
      });

      it(`recursively computes group status ${status}`, async function(){
        await scheduler.setTaskStatus(t1, "success");
        const t3 = await scheduler.createChild(t2, {type: "delayTask", data: {time: 0}, status });
        const alltasks = await scheduler.getTasks();
        expect(alltasks).to.have.length(1);
        expect(alltasks[0]).to.have.property("groupStatus", status);

      });
    });

    describe("all tasks", function(){
      it("filter by task status", async function(){
        let list = await scheduler.getTasks({ status: "initializing"});
        expect(list).to.have.length(0);
        let t = await scheduler.create(scene_id, user_id,  {type: "delayTask", data: {time: 0}, status: "initializing"});

        list = await scheduler.getTasks({status: "initializing"});
        expect(list).to.have.length(1);
        expect(list[0]).to.have.property("children").to.have.length(0);
        expect(list[0]).to.have.property("task_id", t);
      });

      it("filter by reference date", async function(){
        const time_ref = new Date('2025-10-28');
        await handle.run("UPDATE tasks SET ctime = $1", [time_ref]);
        let t = await scheduler.create(scene_id, user_id,  {type: "delayTask", data: {time: 0}});
        await handle.run("UPDATE tasks SET ctime = $1 WHERE task_id = $2", [new Date(time_ref.valueOf() + 1000*3600*12), t]);

        const list = await scheduler.getTasks({after: new Date(time_ref.valueOf() + 1000*3600)});
        expect(list).to.have.length(1);
        expect(list[0]).to.have.property("task_id", t);
      });
      
      it("filter by reference date-string", async function(){
        const time_ref = new Date('2025-10-28');
        await handle.run("UPDATE tasks SET ctime = $1", [time_ref]);
        let t = await scheduler.create(scene_id, user_id,  {type: "delayTask", data: {time: 0}});
        await handle.run("UPDATE tasks SET ctime = $1 WHERE task_id = $2", [new Date(time_ref.valueOf() + 1000*3600*12), t]);

        const list = await scheduler.getTasks({after: new Date(time_ref.valueOf() + 1000*3600).toISOString()});
        expect(list).to.have.length(1);
        expect(list[0]).to.have.property("task_id", t);
      });

      it("filter by interval", async function(){
        //Take a ref 12 hours ago
        const time_ref = new Date(Date.now()-  1000*3600*12);
        await handle.run("UPDATE tasks SET ctime = $1", [time_ref]);
        let t = await scheduler.create(scene_id, user_id,  {type: "delayTask", data: {time: 0}});
        //Make this task be ~ 1h ago
        await handle.run("UPDATE tasks SET ctime = $1 WHERE task_id = $2", [new Date(Date.now() - 1000*3600), t]);

        //Search one-hour-one-minute ago
        let list = await scheduler.getTasks({after: "PT1H1M"});
        expect(list).to.have.length(1);
        expect(list[0]).to.have.property("task_id", t);
        
        list = await scheduler.getTasks({after: "PT13H"});
        expect(list).to.have.length(2);
      });
    });

    describe("own tasks", function(){
      it("get a list of owned tasks", async function(){
        let oscar = await _userManager.addUser("oscar", "12345678", "create");
        await scheduler.create(scene_id, oscar.uid,  {type: "delayTask", data: {time: 0}});

        const ownTasks = await scheduler.getTasks({user_id});
        expect(ownTasks).to.have.length(1);
      });

      it("can filter by task status", async function(){
        let list = await scheduler.getTasks({user_id, status: "initializing"});
        expect(list).to.have.length(0);
        let t = await scheduler.create(scene_id, user_id,  {type: "delayTask", data: {time: 0}, status: "initializing"});

        list = await scheduler.getTasks({user_id, status: "initializing"});
        expect(list).to.have.length(1);
        expect(list[0]).to.have.property("children").to.have.length(0);
        expect(list[0]).to.have.property("task_id", t);
      });
    });

    describe("scene tasks", function(){
      it("get a list of scene tasks", async function(){
        const s2 = await _vfs.createScene("scene-2-getTasks");
        await scheduler.create(s2, user_id,  {type: "delayTask", data: {time: 0}});;

        const sceneTasks = await scheduler.getTasks({scene_id});
        expect(sceneTasks).to.have.length(1);
        expect(sceneTasks[0]).to.have.property("scene_name", scene_name);
        expect(sceneTasks[0]).to.have.property("children").to.have.length(2);
      });
    });
  });


  describe("wait()", function(){
    it("returns immediately if tasks has completed", async function(){
      let t = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0}, status: "success"});
      await expect(scheduler.wait(t)).to.be.fulfilled;
    });

    it("throws if tasks has failed", async function(){
      let t = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0, value: "foo"}, status: "error"});
      await expect(scheduler.wait(t)).to.be.rejected;
    });

    it("waits for a task to complete", async function(){
      let t = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0, value: "foo"}});
      setTimeout(()=>{
        scheduler.setTaskStatus(t, "success");
      }, 5);
      await expect(scheduler.wait(t)).to.be.fulfilled;
    });

    it("throws if tasks errors-out", async function(){
      let t = await scheduler.create(scene_id, null,  {type: "delayTask", data: {time: 0, value: "foo"}});
      setTimeout(()=>{
        scheduler.setTaskStatus(t, "error");
      }, 5);
      await expect(scheduler.wait(t)).to.be.rejected;
    });

    it.skip("waits recursively", async function(){
      throw new Error("Unsupported");
    });

    it.skip("throws when task dependencies errors out", async function(){
      throw new Error("Unimplemented");
    });
  });

  describe("getTaskTree()", function(){


    it("get task relations", async function(){
      let parent = await scheduler.create(scene_id, user_id, {type: "delayTask", data: {time: 0}});
      let t1 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}});
      let t2 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}, after: [t1]});
      let task = await scheduler.getTaskTree(t2);
      expect(task).to.have.property("task_id", t2);
      expect(task.children).to.have.length(0);
      expect(task).to.have.property("after").to.deep.equal( [t1]);
    });

    it("get nested task relations", async function(){
      let root = await scheduler.create(scene_id, user_id, {type: "delayTask", data: {time: 0}});
      let parent = await scheduler.createChild(root, {type: "delayTask", data: {time: 0}});
      let t1 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}});
      let t2 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}, after: [t1]});
      let task = await scheduler.getTaskTree(root);
      expect(task.children).to.have.length(1);
      expect(task.children[0].children).to.have.length(2);
      expect(task.children[0].children[1]).to.have.property("task_id", t2);
      expect(task.children[0].children[1]).to.have.property("after").to.deep.equal( [t1]);
    });

    it("throws on invalid id", async function(){
      await expect(scheduler.getTaskTree(-1)).to.be.rejectedWith(NotFoundError);
    });
  })

  describe("getRootTree()", function(){

    it("recursively walks to the root task", async function(){
      let root = await scheduler.create(scene_id, user_id, {type: "delayTask", data: {time: 0}});
      let t1 = await scheduler.createChild(root, {type: "delayTask", data: {time: 0}});
      let t2 = await scheduler.createChild(t1, {type: "delayTask", data: {time: 0}});
      const ref = await scheduler.getRootTree(root);
      expect(await scheduler.getRootTree(t1)).to.deep.equal(ref);
      expect(await scheduler.getRootTree(t2)).to.deep.equal(ref);
    })

    it("has same shape as getTaskTree", async function(){
      let root = await scheduler.create(scene_id, user_id, {type: "delayTask", data: {time: 0}});
      let t1 = await scheduler.createChild(root, {type: "delayTask", data: {time: 0}});
      let t2 = await scheduler.createChild(t1, {type: "delayTask", data: {time: 0}});
      const ref = await scheduler.getTaskTree(root);
      expect(await scheduler.getRootTree(root)).to.deep.equal(ref);
    });
  })
});