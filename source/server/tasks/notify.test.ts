// Tests for what the scheduler does with a task's `notify` option

import EventEmitter from "node:events";
import { randomBytes } from "node:crypto";
import timers from "node:timers/promises";

import UserManager from "../auth/UserManager.js";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { TaskScheduler } from "./scheduler.js";
import { AwaitingResponse } from "./types.js";


class FakeResponse extends EventEmitter implements AwaitingResponse{
  writableFinished = false;
  destroyed = false;
  /** The response was sent, and fully written */
  finish(){
    this.writableFinished = true;
    this.destroyed = true;
    this.emit("close");
  }
  /** The client went away before the response could be completed */
  abort(){
    this.destroyed = true;
    this.emit("close");
  }
}


describe("TaskScheduler notify option", function(){
  let db_uri: string, handle: Database, scheduler: TaskScheduler<{db: Database}>;
  let user_id: number;

  /** Gives up eventually: a loop outliving its failed test would keep mocha from exiting */
  async function until(condition: ()=>unknown){
    const deadline = Date.now() + 5000;
    while(!await condition()){
      if(deadline < Date.now()) throw new Error(`Timeout waiting for: ${condition}`);
      await timers.setTimeout(2);
    }
  }

  const stateOf = async (task_id: number)=>{
    return (await handle.get<{notify: string}>(`SELECT notify FROM tasks WHERE task_id = $1`, [task_id]))!.notify;
  };

  const notifications = async (task_id: number)=>{
    return await handle.all(`SELECT notification_id, type FROM notifications WHERE fk_task_id = $1`, [task_id]);
  };

  /** A task that doesn't settle until it's told to */
  function controlled(){
    let settle!: ()=>void, fail!: (e: Error)=>void, id: number|undefined;
    const release = new Promise<void>((resolve, reject)=>{ settle = resolve; fail = reject; });
    return {
      settle,
      fail,
      taskId: async ()=>{
        await until(()=> id !== undefined);
        return id!;
      },
      handler: async function({task}: {task: {task_id: number}}){
        id = task.task_id;
        await release;
      },
    };
  }

  this.beforeAll(async function(){
    db_uri = await getUniqueDb("ecorpus_task_notify_tests");
    handle = await openDatabase({uri: db_uri});
    const userManager = new UserManager(handle);
    user_id = (await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"))).uid;
  });

  this.afterAll(async function(){
    await handle?.end();
    await dropDb(db_uri);
  });

  this.beforeEach(function(){
    scheduler = new TaskScheduler({db: handle});
  });

  this.afterEach(async function(){
    await scheduler.close();
  });


  describe("a response waiting on the task", function(){
    it("that delivers the outcome: no notification", async function(){
      const res = new FakeResponse();
      let task_id!: number;
      await scheduler.run({type: "testTask", data: {}, user_id, notify: res, handler: async ({task})=>{ task_id = task.task_id; }});
      expect(await stateOf(task_id)).to.equal("awaited");
      res.finish();
      //Nothing to wait for, as there is nothing to do: give it a chance to do the wrong thing
      await timers.setTimeout(20);
      expect(await stateOf(task_id)).to.equal("awaited");
      expect(await notifications(task_id)).to.deep.equal([]);
    });

    it("that delivers a failure: no notification", async function(){
      const res = new FakeResponse();
      let task_id!: number;
      await expect(scheduler.run({type: "testTask", data: {}, user_id, notify: res, handler: async ({task})=>{
        task_id = task.task_id;
        throw new Error("Task failed");
      }})).to.be.rejectedWith("Task failed");
      res.finish();
      await timers.setTimeout(20);
      expect(await notifications(task_id)).to.deep.equal([]);
    });

    it("whose client leaves during the task: notifies when it settles", async function(){
      const res = new FakeResponse();
      const {handler, settle, taskId} = controlled();
      const running = scheduler.run({type: "testTask", data: {}, user_id, notify: res, handler});
      const task_id = await taskId();

      res.abort();
      await until(async ()=> await stateOf(task_id) === "yes");
      expect(await notifications(task_id), "it's still running").to.deep.equal([]);

      settle();
      await running;
      expect(await notifications(task_id)).to.have.length(1);
    });

    it("whose client leaves during a task that then fails: notifies", async function(){
      const res = new FakeResponse();
      const {handler, fail, taskId} = controlled();
      const running = scheduler.run({type: "testTask", data: {}, user_id, notify: res, handler});
      const task_id = await taskId();
      res.abort();
      await until(async ()=> await stateOf(task_id) === "yes");
      fail(new Error("Task failed"));
      await expect(running).to.be.rejectedWith("Task failed");
      expect(await notifications(task_id)).to.have.length(1);
    });

    it("that fails to get through after the task settled: notifies", async function(){
      const res = new FakeResponse();
      let task_id!: number;
      await scheduler.run({type: "testTask", data: {}, user_id, notify: res, handler: async ({task})=>{ task_id = task.task_id; }});
      expect(await notifications(task_id)).to.deep.equal([]);
      res.abort();
      await until(async ()=> (await notifications(task_id)).length);
    });

    it("that was answered without waiting for the task: notifies when it settles", async function(){
      const res = new FakeResponse();
      const {handler, settle, taskId} = controlled();
      const running = scheduler.run({type: "testTask", data: {}, user_id, notify: res, handler});
      const task_id = await taskId();

      res.finish();
      await until(async ()=> await stateOf(task_id) === "yes");
      expect(await notifications(task_id), "it's still running").to.deep.equal([]);

      settle();
      await running;
      expect(await notifications(task_id)).to.have.length(1);
    });

    it("that was already over when the task got created: notifies when it settles", async function(){
      const res = new FakeResponse();
      res.abort();
      const task = await scheduler.create({type: "testTask", data: {}, user_id, notify: res});
      await until(async ()=> await stateOf(task.task_id) === "yes");
      await scheduler.releaseTask(task.task_id);
      expect(await notifications(task.task_id)).to.have.length(1);
    });

    it("works for a task that's created, and run later", async function(){
      const res = new FakeResponse();
      const task = await scheduler.create({type: "testTask", data: {}, user_id, notify: res});
      await scheduler.runTask({task, handler: async ()=>{}});
      res.finish();
      await timers.setTimeout(20);
      expect(await notifications(task.task_id)).to.deep.equal([]);
    });

    it("that closes on a task that was created but not run: notifies when it settles", async function(){
      const res = new FakeResponse();
      const task = await scheduler.create({type: "testTask", data: {}, user_id, notify: res});
      res.finish();
      await until(async ()=> await stateOf(task.task_id) === "yes");
      await scheduler.runTask({task, handler: async ()=>{}});
      expect(await notifications(task.task_id)).to.have.length(1);
    });

    it("also works from a handler's context, which is a copy of the scheduler", async function(){
      const res = new FakeResponse();
      const task = await Object.create(scheduler).create({type: "testTask", data: {}, user_id, notify: res});
      res.abort();
      await until(async ()=> await stateOf(task.task_id) === "yes");
    });

    it("doesn't outlive what it tracks", async function(){
      const res = new FakeResponse();
      await scheduler.run({type: "testTask", data: {}, user_id, notify: res, handler: async ()=>{}});
      expect((scheduler as any).awaited.size).to.equal(1);
      res.finish();
      expect((scheduler as any).awaited.size).to.equal(0);
      expect(res.listenerCount("close")).to.equal(0);
    });

    it("isn't an error if it closes once the scheduler is closed", async function(){
      const res = new FakeResponse();
      const other = new TaskScheduler({db: handle});
      await other.create({type: "testTask", data: {}, user_id, notify: res});
      await other.close();
      //It would take the whole process down in production
      const rejections: unknown[] = [];
      const onRejection = (reason: unknown)=>{ rejections.push(reason); };
      process.on("unhandledRejection", onRejection);
      try{
        res.abort();
        await timers.setTimeout(20);
      }finally{
        process.off("unhandledRejection", onRejection);
      }
      expect(rejections).to.deep.equal([]);
    });
  });


  describe("other values", function(){
    it("notifies when it settles with true", async function(){
      let task_id!: number;
      await scheduler.run({type: "testTask", data: {}, user_id, notify: true, handler: async ({task})=>{ task_id = task.task_id; }});
      expect(await stateOf(task_id)).to.equal("yes");
      expect(await notifications(task_id)).to.have.length(1);
    });

    it("doesn't notify by default", async function(){
      let task_id!: number;
      await scheduler.run({type: "testTask", data: {}, user_id, handler: async ({task})=>{ task_id = task.task_id; }});
      expect(await stateOf(task_id)).to.equal("no");
      expect(await notifications(task_id)).to.deep.equal([]);
    });

    it("doesn't notify with false", async function(){
      const task = await scheduler.create({type: "testTask", data: {}, user_id, notify: false});
      expect(await stateOf(task.task_id)).to.equal("no");
    });

    it("isn't inherited by child tasks", async function(){
      let child_id!: number;
      await scheduler.run({type: "testTask", data: {}, user_id, notify: true, handler: async ({context: {tasks}})=>{
        await tasks.run({type: "childTask", data: {}, handler: async ({task})=>{ child_id = task.task_id; }});
      }});
      expect(await stateOf(child_id)).to.equal("no");
      expect(await notifications(child_id)).to.deep.equal([]);
    });
  });


  describe("reapOrphans()", function(){
    it("notifies for tasks a response was waiting on: it's gone too", async function(){
      const task = await scheduler.create({type: "testTask", data: {}, user_id, notify: new FakeResponse(), status: "running"});
      await scheduler.reapOrphans();
      expect(await stateOf(task.task_id)).to.equal("yes");
      expect(await notifications(task.task_id)).to.have.length(1);
    });

    it("notifies for tasks that were to notify", async function(){
      const task = await scheduler.create({type: "testTask", data: {}, user_id, notify: true, status: "running"});
      await scheduler.reapOrphans();
      expect(await notifications(task.task_id)).to.have.length(1);
    });

    it("doesn't notify for tasks that weren't to", async function(){
      const task = await scheduler.create({type: "sendEmail", data: {}, user_id, status: "running"});
      await scheduler.reapOrphans();
      expect(await stateOf(task.task_id)).to.equal("no");
      expect(await notifications(task.task_id)).to.deep.equal([]);
    });

    it("doesn't notify for an abandoned upload", async function(){
      const task = await scheduler.create({type: "parseUserUpload", data: {}, user_id, status: "initializing"});
      await scheduler.reapOrphans();
      expect(await notifications(task.task_id)).to.deep.equal([]);
    });

    it("leaves settled tasks alone, even if they were awaited", async function(){
      const task = await scheduler.create({type: "testTask", data: {}, user_id, notify: new FakeResponse(), status: "success"});
      await scheduler.reapOrphans();
      expect(await stateOf(task.task_id)).to.equal("awaited");
      expect(await notifications(task.task_id)).to.deep.equal([]);
    });
  });
});
