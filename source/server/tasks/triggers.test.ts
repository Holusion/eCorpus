// Tests for what the triggers of migration 010 do: publishing task changes on the `task_events` channel,
// and creating notifications

import { randomBytes } from "node:crypto";
import { Client } from "pg";

import UserManager from "../auth/UserManager.js";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import Vfs from "../vfs/index.js";
import { cleanOldTasks } from "./handlers/cleanup.js";
import { TaskManager } from "./manager.js";
import { TaskScheduler } from "./scheduler.js";
import { TaskEvent } from "./types.js";


describe("task_events channel", function(){
  let db_uri: string, handle: Database, vfs: Vfs, userManager: UserManager;
  let listener: Client, tasks: TaskManager;
  let scene_id: number, user_id: number;
  let received: TaskEvent[] = [];
  let onSentinel: ((payload: string)=>void)|null = null;

  const SENTINEL = "sentinel:";

  /**
   * Runs `action` and returns the events it caused.
   * Notifications are delivered in commit order, so once a sentinel sent after `action`
   * comes back, anything `action` committed has arrived: testing that something did NOT
   * happen requires no arbitrary delay.
   */
  async function eventsOf(action: ()=>unknown = ()=>{}): Promise<TaskEvent[]>{
    received = [];
    await action();
    const id = SENTINEL + randomBytes(4).toString("hex");
    const arrived = new Promise<void>((resolve)=>{
      onSentinel = (payload)=>{ if(payload === id) resolve(); };
    });
    await handle.run(`SELECT pg_notify('task_events', $1)`, [id]);
    await arrived;
    return [...received];
  }

  /** Creates a task without counting it in the events of the current test */
  async function createTask(params: {status?: any, scene_id?: number|null, user_id?: number|null, parent?: number|null, type?: string, data?: any} = {}){
    let task!: Awaited<ReturnType<TaskManager["create"]>>;
    await eventsOf(async ()=>{
      task = await tasks.create({type: "testTask", data: {}, ...params});
    });
    return task;
  }

  this.beforeAll(async function(){
    db_uri = await getUniqueDb("ecorpus_task_events_tests");
    handle = await openDatabase({uri: db_uri});
    vfs = new Vfs("/dev/null", handle);
    userManager = new UserManager(handle);
    scene_id = await vfs.createScene(randomBytes(8).toString("base64url"));
    user_id = (await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"))).uid;

    listener = new Client({connectionString: db_uri});
    await listener.connect();
    listener.on("notification", ({payload = ""})=>{
      if(payload.startsWith(SENTINEL)) onSentinel?.(payload);
      else received.push(JSON.parse(payload));
    });
    await listener.query(`LISTEN task_events`);
  });

  this.afterAll(async function(){
    await listener?.end();
    await handle?.end();
    await dropDb(db_uri);
  });

  this.beforeEach(async function(){
    tasks = new TaskManager(handle);
    //Through eventsOf() so the deletions can't be counted in the test that follows
    await eventsOf(()=> handle.run(`DELETE FROM tasks`));
  });


  describe("payload", function(){
    it("describes the task", async function(){
      const parent = await createTask();
      let task!: Awaited<ReturnType<TaskManager["create"]>>;
      const events = await eventsOf(async ()=>{
        task = await tasks.create({type: "testTask", data: {}, scene_id, user_id, parent: parent.task_id});
      });
      expect(events).to.deep.equal([{
        task_id: task.task_id,
        parent: parent.task_id,
        type: "testTask",
        status: "pending",
        scene_id,
        user_id,
      }]);
    });

    it("identifiers are safe to read as numbers", async function(){
      //User and scene ids are random, up to 2^48: they must not be rounded by JSON.parse.
      const [event] = await eventsOf(()=> tasks.create({type: "testTask", data: {}, scene_id, user_id}));
      expect(event.user_id).to.equal(user_id);
      expect(event.scene_id).to.equal(scene_id);
    });

    it("never carries data or output", async function(){
      const secret = "secret-"+randomBytes(8).toString("hex");
      const events = await eventsOf(async ()=>{
        const task = await tasks.create({type: "testTask", data: {secret}});
        await tasks.releaseTask(task.task_id, {secret});
      });
      expect(events.map(e=> e.status)).to.deep.equal(["pending", "success"]);
      expect(JSON.stringify(events)).not.to.include(secret);
      for(const event of events){
        expect(event).to.have.all.keys("task_id", "parent", "type", "status", "scene_id", "user_id");
      }
    });

    it("a very long type can't make the write fail", async function(){
      const type = "x".repeat(9000); //pg_notify raises above 8000 bytes
      let task!: Awaited<ReturnType<TaskManager["create"]>>;
      const events = await eventsOf(async ()=>{
        task = await tasks.create({type, data: {}});
      });
      expect((await tasks.getTask(task.task_id)).type).to.equal(type);
      expect(events).to.have.length(1);
      expect(events[0].type).to.equal("x".repeat(128));
    });

    it("handles a type of multi-byte characters", async function(){
      const type = "🦴".repeat(9000);
      const events = await eventsOf(()=> tasks.create({type, data: {}}));
      expect(events).to.have.length(1);
      expect(events[0].type).to.equal("🦴".repeat(128));
    });
  });


  describe("status changes", function(){
    it("are published for every TaskManager transition", async function(){
      const task = await createTask({status: "initializing"});
      expect(await eventsOf(()=> tasks.setTaskStatus(task.task_id, "pending"))).to.have.nested.property("[0].status", "pending");
      expect(await eventsOf(()=> tasks.takeTask(task.task_id))).to.have.nested.property("[0].status", "running");
      expect(await eventsOf(()=> tasks.releaseTask(task.task_id, {}))).to.have.nested.property("[0].status", "success");

      const failed = await createTask();
      expect(await eventsOf(()=> tasks.errorTask(failed.task_id, new Error("failed")))).to.have.nested.property("[0].status", "error");
    });

    it("are published in order for a scheduled task", async function(){
      const scheduler = new TaskScheduler({db: handle});
      const events = await eventsOf(()=> scheduler.run({
        type: "scheduledTask",
        data: {},
        handler: async function({context: {logger}}){
          logger.info("Log lines are not task events");
        },
      }));
      //The logger flushes asynchronously: this also ensures its inserts stay silent.
      expect(events.map(e=> e.status)).to.deep.equal(["pending", "running", "success"]);
      await scheduler.close();
    });

    it("reapOrphans publishes each task it fails", async function(){
      const scheduler = new TaskScheduler({db: handle});
      const running = await createTask({status: "running"});
      const pending = await createTask({status: "pending"});
      await createTask({status: "success"});
      const events = await eventsOf(()=> scheduler.reapOrphans());
      expect(events.map(e=> [e.task_id, e.status])).to.have.deep.members([
        [running.task_id, "error"],
        [pending.task_id, "error"],
      ]);
      await scheduler.close();
    });
  });


  describe("visibility changes", function(){
    it("setTaskScene publishes the new scene", async function(){
      const task = await createTask({user_id});
      const events = await eventsOf(()=> tasks.setTaskScene(task.task_id, scene_id));
      expect(events).to.have.length(1);
      expect(events[0]).to.include({task_id: task.task_id, scene_id, user_id, status: "pending"});
    });

    it("setTaskParent publishes the parent and what it inherited", async function(){
      const parent = await createTask({scene_id, user_id});
      const task = await createTask();
      const events = await eventsOf(()=> tasks.setTaskParent(task.task_id, parent.task_id));
      expect(events).to.have.length(1);
      expect(events[0]).to.include({task_id: task.task_id, parent: parent.task_id, scene_id, user_id});
    });

    it("deleting the owner publishes the orphaned task", async function(){
      const owner = await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"));
      const task = await createTask({user_id: owner.uid});
      const events = await eventsOf(()=> handle.run(`DELETE FROM users WHERE user_id = $1`, [owner.uid]));
      expect(events).to.have.length(1);
      expect(events[0]).to.include({task_id: task.task_id, user_id: null});
    });
  });


  describe("silent updates", function(){
    it("writing the output alone", async function(){
      const task = await createTask({status: "running"});
      expect(await eventsOf(()=> handle.run(`UPDATE tasks SET output = '{"progress": 1}' WHERE task_id = $1`, [task.task_id]))).to.deep.equal([]);
    });

    it("writing the data alone", async function(){
      const task = await createTask({status: "running"});
      expect(await eventsOf(()=> handle.run(`UPDATE tasks SET data = '{"a": 1}' WHERE task_id = $1`, [task.task_id]))).to.deep.equal([]);
    });

    it("rewriting identical values", async function(){
      const task = await createTask({status: "running", scene_id, user_id});
      expect(await eventsOf(()=> handle.run(`
        UPDATE tasks SET status = status, fk_scene_id = fk_scene_id, fk_user_id = fk_user_id, parent = parent WHERE task_id = $1
      `, [task.task_id]))).to.deep.equal([]);
    });

    it("writing logs", async function(){
      const task = await createTask({status: "running"});
      expect(await eventsOf(()=> handle.run(`INSERT INTO tasks_logs(fk_task_id, message) VALUES ($1, 'hello')`, [task.task_id]))).to.deep.equal([]);
    });
  });


  describe("transactions", function(){
    it("publishes only on commit", async function(){
      const task = await createTask({status: "running"});
      let during: TaskEvent[]|undefined;
      const after = await eventsOf(()=> handle.beginTransaction(async (tr)=>{
        await tr.run(`UPDATE tasks SET status = 'success' WHERE task_id = $1`, [task.task_id]);
        //eventsOf() sends its sentinel through another connection, which commits first
        during = await eventsOf();
      }));
      expect(during).to.deep.equal([]);
      expect(after).to.have.length(1);
      expect(after[0]).to.include({task_id: task.task_id, status: "success"});
    });

    it("publishes nothing on rollback", async function(){
      const task = await createTask({status: "running"});
      const events = await eventsOf(async ()=>{
        await expect(handle.beginTransaction(async (tr)=>{
          await tr.run(`UPDATE tasks SET status = 'success' WHERE task_id = $1`, [task.task_id]);
          throw new Error("Rollback");
        })).to.be.rejectedWith("Rollback");
      });
      expect(events).to.deep.equal([]);
    });

    it("publishes nothing for a rolled back savepoint", async function(){
      const task = await createTask({status: "running"});
      const other = await createTask({status: "running"});
      const events = await eventsOf(()=> handle.beginTransaction(async (tr)=>{
        await tr.run(`UPDATE tasks SET status = 'success' WHERE task_id = $1`, [task.task_id]);
        await expect(tr.beginTransaction(async (nested)=>{
          await nested.run(`UPDATE tasks SET status = 'error' WHERE task_id = $1`, [other.task_id]);
          throw new Error("Rollback");
        })).to.be.rejectedWith("Rollback");
      }));
      expect(events).to.have.length(1);
      expect(events[0]).to.include({task_id: task.task_id, status: "success"});
    });
  });


  describe("deletions", function(){
    for(const status of ["initializing", "pending", "running"]){
      it(`publishes a ${status} task's deletion`, async function(){
        const task = await createTask({status, scene_id, user_id});
        const events = await eventsOf(()=> tasks.deleteTask(task.task_id));
        expect(events).to.deep.equal([{
          task_id: task.task_id,
          parent: null,
          type: "testTask",
          status: "deleted",
          scene_id,
          user_id,
        }]);
      });
    }

    for(const status of ["success", "error"]){
      it(`stays silent for a ${status} task`, async function(){
        const task = await createTask({status});
        expect(await eventsOf(()=> tasks.deleteTask(task.task_id))).to.deep.equal([]);
      });
    }

    it("publishes tasks still active when their parent is cascaded", async function(){
      const root = await createTask({status: "success"});
      const child = await createTask({status: "running", parent: root.task_id});
      const done = await createTask({status: "success", parent: root.task_id});
      const events = await eventsOf(()=> tasks.deleteTask(root.task_id));
      expect(events.map(e=> [e.task_id, e.status])).to.deep.equal([[child.task_id, "deleted"]]);
      expect(events.map(e=> e.task_id)).not.to.include(done.task_id);
    });

    it("publishes tasks still active when their scene is deleted", async function(){
      const scene = await vfs.createScene(randomBytes(8).toString("base64url"));
      const running = await createTask({status: "running", scene_id: scene});
      await createTask({status: "success", scene_id: scene});
      const events = await eventsOf(()=> handle.run(`DELETE FROM scenes WHERE scene_id = $1`, [scene]));
      expect(events).to.have.length(1);
      expect(events[0]).to.include({task_id: running.task_id, status: "deleted", scene_id: scene});
    });

    it("the retention sweep stays silent", async function(){
      for(const status of ["success", "error"]){
        const task = await createTask({status});
        await handle.run(`UPDATE tasks SET ctime = now() - interval '1 year' WHERE task_id = $1`, [task.task_id]);
      }
      const config = {get: (key: string)=> key === "task_retention_days" ? 30: 90};
      const logger = {log(){}};
      let result: Awaited<ReturnType<typeof cleanOldTasks>>|undefined;
      const events = await eventsOf(async ()=>{
        result = await cleanOldTasks({context: {db: handle, config, logger}} as any);
      });
      expect(result).to.deep.equal({success: 1, error: 1});
      expect(events).to.deep.equal([]);
    });
  });


  describe("idx_tasks_active", function(){
    //Forces the planner's hand: it would rightly seq-scan a table this small, and we want
    //to know the partial index's predicate can be matched by the lookups it's made for.
    async function plan(where: string, params: any[]){
      return await handle.beginTransaction(async (tr)=>{
        await tr.run(`SET LOCAL enable_seqscan = off`);
        await tr.run(`SET LOCAL enable_bitmapscan = off`);
        const rows = await tr.all<{"QUERY PLAN": string}>(`EXPLAIN SELECT task_id FROM tasks WHERE status IN ('pending', 'running') AND ${where}`, params);
        return rows.map(r=> r["QUERY PLAN"]).join("\n");
      });
    }

    it("serves lookups of a user's active tasks", async function(){
      expect(await plan(`fk_user_id = $1`, [user_id])).to.include("idx_tasks_active");
    });

    it("serves lookups of a scene's active tasks", async function(){
      expect(await plan(`fk_scene_id = $1`, [scene_id])).to.include("idx_tasks_active");
    });

    it("holds no terminal task", async function(){
      const {indexdef} = (await handle.get<{indexdef: string}>(`SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_tasks_active'`))!;
      expect(indexdef).to.match(/WHERE/);
      expect(indexdef).not.to.match(/success|error|initializing/);
    });
  });
});


describe("notifications triggers", function(){
  let db_uri: string, handle: Database, vfs: Vfs, userManager: UserManager;
  let tasks: TaskManager, user_id: number;
  /** What `notify` expects when a response is waiting on the task. The manager doesn't watch it. */
  const response = {once(){}, writableFinished: false, destroyed: false};

  const notificationsOf = async (task_id: number)=>{
    return await handle.all(`SELECT fk_user_id AS user_id, type FROM notifications WHERE fk_task_id = $1`, [task_id]);
  };

  this.beforeAll(async function(){
    db_uri = await getUniqueDb("ecorpus_notifications_triggers_tests");
    handle = await openDatabase({uri: db_uri});
    vfs = new Vfs("/dev/null", handle);
    userManager = new UserManager(handle);
    user_id = (await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"))).uid;
    tasks = new TaskManager(handle);
  });

  this.afterAll(async function(){
    await handle?.end();
    await dropDb(db_uri);
  });

  describe("a task set to notify", function(){
    it("creates one when it succeeds", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id, notify: true});
      expect(await notificationsOf(task.task_id), "not settled").to.deep.equal([]);
      await tasks.takeTask(task.task_id);
      expect(await notificationsOf(task.task_id), "not settled").to.deep.equal([]);
      await tasks.releaseTask(task.task_id, {});
      expect(await notificationsOf(task.task_id)).to.deep.equal([{user_id, type: "task"}]);
    });

    it("creates one when it fails", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id, notify: true});
      await tasks.errorTask(task.task_id, new Error("Task failed"));
      expect(await notificationsOf(task.task_id)).to.have.length(1);
    });

    it("needs an owner", async function(){
      const task = await tasks.create({type: "testTask", data: {}, notify: true});
      await tasks.releaseTask(task.task_id, {});
      expect(await notificationsOf(task.task_id)).to.deep.equal([]);
    });

    it("has to be a root task", async function(){
      const root = await tasks.create({type: "testTask", data: {}, user_id});
      const child = await tasks.create({type: "testTask", data: {}, user_id, notify: true, parent: root.task_id});
      await tasks.releaseTask(child.task_id, {});
      expect(await notificationsOf(child.task_id)).to.deep.equal([]);
    });

    it("creates only one, even if it settles twice", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id, notify: true});
      await tasks.errorTask(task.task_id, new Error("Task failed"));
      await tasks.setTaskStatus(task.task_id, "running");
      await tasks.releaseTask(task.task_id, {});
      expect(await notificationsOf(task.task_id)).to.have.length(1);
    });
  });

  it("a task not set to notify creates nothing", async function(){
    const task = await tasks.create({type: "testTask", data: {}, user_id});
    await tasks.releaseTask(task.task_id, {});
    expect(await notificationsOf(task.task_id)).to.deep.equal([]);
  });

  describe("an awaited task", function(){
    it("creates nothing when it settles", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id, notify: response});
      await tasks.releaseTask(task.task_id, {});
      expect(await notificationsOf(task.task_id)).to.deep.equal([]);
    });

    it("creates one when it settles, if it's not awaited anymore", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id, notify: response});
      await tasks.stopAwaiting(task.task_id);
      expect(await notificationsOf(task.task_id), "not settled").to.deep.equal([]);
      await tasks.releaseTask(task.task_id, {});
      expect(await notificationsOf(task.task_id)).to.have.length(1);
    });

    it("creates one when it stops being awaited, if it has settled", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id, notify: response});
      await tasks.errorTask(task.task_id, new Error("Task failed"));
      await tasks.stopAwaiting(task.task_id);
      expect(await notificationsOf(task.task_id)).to.have.length(1);
    });

    it("creates only one when it stops being awaited twice", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id, notify: response});
      await tasks.releaseTask(task.task_id, {});
      await tasks.stopAwaiting(task.task_id);
      await tasks.stopAwaiting(task.task_id);
      expect(await notificationsOf(task.task_id)).to.have.length(1);
    });
  });

  it("stopAwaiting() can't make a task notify that wasn't to", async function(){
    const task = await tasks.create({type: "testTask", data: {}, user_id});
    await tasks.releaseTask(task.task_id, {});
    await tasks.stopAwaiting(task.task_id);
    expect(await notificationsOf(task.task_id)).to.deep.equal([]);
  });

  it("creates nothing on rollback", async function(){
    const task = await tasks.create({type: "testTask", data: {}, user_id, notify: true});
    await expect(handle.beginTransaction(async (tr)=>{
      await tr.run(`UPDATE tasks SET status = 'success' WHERE task_id = $1`, [task.task_id]);
      throw new Error("Rollback");
    })).to.be.rejectedWith("Rollback");
    expect(await notificationsOf(task.task_id)).to.deep.equal([]);
  });

  it("allows several notifications for a user that aren't about a task", async function(){
    const scene_id = await vfs.createScene(randomBytes(8).toString("base64url"));
    for(let i = 0; i < 2; i++){
      await handle.run(`INSERT INTO notifications(fk_user_id, type, fk_scene_id) VALUES ($1, 'scene_shared', $2)`, [user_id, scene_id]);
    }
    const rows = await handle.all(`SELECT 1 FROM notifications WHERE fk_scene_id = $1`, [scene_id]);
    expect(rows).to.have.length(2);
  });

  describe("notifications channel", function(){
    let listener: Client;
    let received: any[] = [];
    let onSentinel: (()=>void)|null = null;

    async function signalsOf(action: ()=>unknown){
      received = [];
      await action();
      const arrived = new Promise<void>((resolve)=>{ onSentinel = resolve; });
      await handle.run(`SELECT pg_notify('notifications', 'sentinel')`);
      await arrived;
      return [...received];
    }

    this.beforeAll(async function(){
      listener = new Client({connectionString: db_uri});
      await listener.connect();
      listener.on("notification", ({payload = ""})=>{
        if(payload === "sentinel") onSentinel?.();
        else received.push(JSON.parse(payload));
      });
      await listener.query(`LISTEN notifications`);
    });

    this.afterAll(async function(){
      await listener?.end();
    });

    it("publishes a signal when one is created", async function(){
      const task = await tasks.create({type: "testTask", data: {secret: "secret"}, user_id, notify: true});
      const signals = await signalsOf(()=> tasks.releaseTask(task.task_id, {secret: "secret"}));
      expect(signals).to.have.length(1);
      expect(signals[0]).to.have.all.keys("notification_id", "user_id", "type");
      expect(signals[0]).to.include({user_id, type: "task"});
    });

    it("publishes nothing when it gets read", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id, notify: true});
      await signalsOf(()=> tasks.releaseTask(task.task_id, {}));
      expect(await signalsOf(()=> userManager.markNotificationsRead(user_id, {upTo: Number.MAX_SAFE_INTEGER}))).to.deep.equal([]);
    });

    it("publishes nothing when the task doesn't notify", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id});
      expect(await signalsOf(()=> tasks.releaseTask(task.task_id, {}))).to.deep.equal([]);
    });

    it("publishes nothing on rollback", async function(){
      expect(await signalsOf(()=> expect(handle.beginTransaction(async (tr)=>{
        await tr.run(`INSERT INTO notifications(fk_user_id, type) VALUES ($1, 'a')`, [user_id]);
        throw new Error("Rollback");
      })).to.be.rejectedWith("Rollback"))).to.deep.equal([]);
    });

    it("isn't affected by the size of a type", async function(){
      const signals = await signalsOf(()=> handle.run(`INSERT INTO notifications(fk_user_id, type) VALUES ($1, $2)`, [user_id, "x".repeat(9000)]));
      expect(signals[0].type).to.equal("x".repeat(64));
    });
  });

  describe("task events", function(){
    it("aren't caused by a change of notify", async function(){
      const listener = new Client({connectionString: db_uri});
      await listener.connect();
      const received: string[] = [];
      let onSentinel!: ()=>void;
      listener.on("notification", ({payload = ""})=>{
        if(payload === "sentinel") onSentinel();
        else received.push(payload);
      });
      await listener.query(`LISTEN task_events`);
      try{
        const task = await tasks.create({type: "testTask", data: {}, user_id, notify: response});
        await tasks.stopAwaiting(task.task_id);
        const arrived = new Promise<void>((resolve)=>{ onSentinel = resolve; });
        await handle.run(`SELECT pg_notify('task_events', 'sentinel')`);
        await arrived;
        expect(received, "only its creation").to.have.length(1);
      }finally{
        await listener.end();
      }
    });
  });
});
