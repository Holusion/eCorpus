

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { TaskScheduler } from "./scheduler.js";
import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import Vfs from "../vfs/index.js";
import UserManager from "../auth/UserManager.js";

// So it's mostly integration tests
describe("TaskScheduler", function(){
  let _vfs :Vfs, _userManager: UserManager;
  let db_uri: string, handle: Database, client: Client;

  let scene_id: number, user_id: number

  let scheduler: TaskScheduler;
  this.beforeAll(async function(){
    db_uri = await getUniqueDb(this.currentTest?.title.replace(/[^\w]/g, "_"));
    handle = await openDatabase({uri: db_uri});
    _vfs = new Vfs("/dev/null", handle);
    _userManager = new UserManager(handle);
    scene_id = await _vfs.createScene(randomBytes(8).toString("base64url"))


    let u = await _userManager.addUser(randomBytes(4).toString("hex"), randomBytes(6).toString("base64"));
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
      let t1 = await scheduler.createChild(parent,  {type: "delayTask", data: {time: 0}});
      let t2 = await scheduler.createChild(parent,  {type: "delayTask", data: {time: 0}, after: [t1]});
      await expect(scheduler.addRelation(t2, t1)).to.be.rejectedWith("check_no_cycles");
    });
  });

  describe("list tasks", function(){
    let parent: number, t1: number, t2: number;

    this.beforeEach(async function(){
      parent = await scheduler.create(scene_id, user_id,  {type: "delayTask", data: {time: 0}});
      t1 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}});
      t2 = await scheduler.createChild(parent, {type: "delayTask", data: {time: 0}});
    });

    it("all list functions have same shape", async function(){
      const ownTasks = await scheduler.listOwnTasks({user_id});
      expect(ownTasks, `expected to receive 1 owned task`).to.have.length(1);

      const sceneTasks = await scheduler.listSceneTasks({scene_id});
      expect(sceneTasks, `expected to receive 1 scene task`).to.have.length(1);

      //In this case, we expect outputs to be strictly equal
      expect(ownTasks).to.deep.equal(sceneTasks);

      const allTasks = await scheduler.listAllTasks();
      expect(allTasks, `expected to receive 1 readable task`).to.have.length(1);

      //In this case, we expect outputs to be strictly equal
      expect(ownTasks).to.deep.equal(allTasks);
    });

    describe("listOwnTasks()", function(){
      it("get a list of owned tasks", async function(){
        const ownTasks = await scheduler.listOwnTasks({user_id});
        expect(ownTasks).to.have.length(1);
      });
    });

    describe("listAllTasks()", function(){
      it("get a list of all tasks", async function(){
        const alltasks = await scheduler.listAllTasks();
        expect(alltasks).to.have.length(1);
      });
    });

    describe("listSceneTasks()", function(){
      it("get a list of scene tasks", async function(){
        const sceneTasks = await scheduler.listSceneTasks({scene_id});
        expect(sceneTasks).to.have.length(1);
      });
    });
  })
});