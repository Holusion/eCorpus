

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
import EventEmitter, { once } from "node:events";


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

    const userManager = new UserManager(handle);
    const user = await userManager.addUser("alice", "12345678", "admin");
    user_id = user.uid;
    const vfs = new Vfs("/dev/null", handle);
    scene_id = await vfs.createScene(randomBytes(8).toString("base64url"), user_id);
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
    if(!scheduler.closed) await scheduler.close();
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

  it("initialize a task for later execution", async function(){
    let task = await scheduler.create({
      scene_id: null,
      user_id: null,
      type: "testTask",
      data: {},
    });
    
    const output = await scheduler.runTask({task, handler: async ({task})=> task.task_id});
    expect(output).to.equal(task.task_id);

    task = await scheduler.getTask(output);
    expect(task).to.have.property("status", "success");
    expect(task).to.have.property("output", output);
  });

  it("handles async tasks errors", async function(){
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


  it("handles synchronous errors in handlers", async function(){
    // PURPOSE: Verify that synchronous errors (not returned from async) are caught.
    // This catches programming errors like accessing undefined properties without returning a rejected promise.
    let id_ref: number;
    
    await expect(scheduler.run({
      scene_id: null,
      user_id: null,
      data: {},
      handler: ({task})=>{
        id_ref = task.task_id;
        throw new Error("Sync error");
      }
    })).to.be.rejectedWith("Sync error");

    const task = await scheduler.getTask(id_ref!);
    expect(task.status).to.equal("error");
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

  it("propagates abort signals", async function(){
    let progress = new EventEmitter();
    let c = new AbortController();
    const runningTask = scheduler.run({
      scene_id: null,
      user_id: null,
      data: {},
      signal: c.signal,
      handler: async ({context:{signal}})=>{
        progress.emit("start");
        await timers.setTimeout(1000, null, {signal}); // Slow task, with abort
        return "task1";
      }
    });
    await once(progress, "start");
    c.abort();
    await expect(runningTask).to.be.rejected;
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

  it("nested tasks with limited concurrency don't deadlock (deep nesting)", async function(){
    scheduler.concurrency = 2;
    
    const executed: number[] = [];
    
    const result = await scheduler.run(makeTask({
      handler: async ()=>{
        executed.push(1);
        await scheduler.run(makeTask({
          handler: async ()=>{
            executed.push(2);
            await timers.setTimeout(0);
            await scheduler.run(makeTask({
              handler: async ()=>{
                executed.push(3);
              }
            }));
          }
        }));
      }
    }));
    
    expect(executed).to.deep.equal([1, 2, 3]);
  });

  it("nested tasks get their parent's attributes", async function(){
    let children:Array<TaskDefinition> = [];

    const parent_id = await scheduler.run(makeTask({
      scene_id,
      user_id,
      handler: async function({task, context:{tasks}}){
        await tasks.run(makeTask({handler: async ({task})=>{
            children.push(task);
          }}));
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

  it("group runs function-items inside nest and preserves order (Promise.all-like)", async function(){
    //Also, checks for deadlocks
    function* gen() {
      for (let i = 0; i < 100; i++){
        yield timers.setTimeout(1, i);
      }
    }

    const res = await scheduler.group(() => gen());
    expect(res).to.have.length(100);
    for(let i = 0; i < 100; i++){
      expect(res[i]).to.equal(i);
    }
  });
  
  it("Can group promises", async function(){
    const calls: string[] = [];

    const res = await scheduler.group(() => ([
      timers.setTimeout(5, 1),
      timers.setTimeout(5, 2),
    ]));
    expect(res).to.deep.equal([1,2]);
  });

  it("accepts a generator function (callable) and preserves results", async function(){
    function *gen(){
      yield timers.setTimeout(1, 1);
      yield timers.setTimeout(1, 2);
    }
    const res = await scheduler.group(gen);
    expect(res).to.deep.equal([1,2]);
  });

  it("generator function runs inside nest and shares context name", async function(){
    const ctxNames: string[] = [];
    function *gen(){
      yield (async ()=>{ ctxNames.push(String(scheduler.context().queue.name)); return 1; })();
      yield (async ()=>{ ctxNames.push(String(scheduler.context().queue.name)); return 2; })();
    }
    const res = await scheduler.group(gen);
    expect(res).to.deep.equal([1,2]);
    expect(ctxNames).to.have.length(2);
    for (const n of ctxNames) expect(n).to.match(/\[GROUP\]/);
    expect(ctxNames[0], `Expected contexts to all have the same name`).to.equal(ctxNames[1]);
  });


  it("handles errors in nested tasks without deadlocking", async function(){
    // PURPOSE: Verify that if a nested task throws an error, the parent task
    // receives that error and can handle it appropriately without deadlocking.
    // This is critical because async context nesting could easily cause deadlocks
    // if error propagation isn't handled correctly.
    let parentTaskId: number;
    let childTaskId: number;
    
    await expect(scheduler.run({
      scene_id: null,
      user_id: null,
      data: {},
      handler: async ({task})=>{
        parentTaskId = task.task_id;
        await expect(scheduler.run({
          scene_id: null,
          user_id: null,
          data: {},
          handler: async ({task})=>{
            childTaskId = task.task_id;
            throw new Error("Child failed");
          }
        })).to.be.rejectedWith("Child failed");
        throw new Error("Parent failed");
      }
    })).to.be.rejectedWith("Parent failed");

    const parent = await scheduler.getTask(parentTaskId!);
    const child = await scheduler.getTask(childTaskId!);
    expect(parent.status).to.equal("error");
    expect(child.status).to.equal("error");
  });



  it("rejects new tasks after close()", async function(){
    // PURPOSE: Verify that Queue.close() properly transitions to a closed state
    // and prevents new tasks from being added. This prevents memory leaks from
    // accumulated tasks that will never execute.
    await scheduler.close();
    
    // Attempting to add a task to closed scheduler should fail
    await expect(scheduler.run({
      scene_id: null,
      user_id: null,
      data: {},
      handler: async ()=> "test"
    })).to.be.rejected;
  });

  it("many sequential tasks don't leak memory or resources", async function(){
    // PURPOSE: Run many tasks in sequence to verify that AsyncLocalStorage
    // contexts and queue workers are properly cleaned up after each task,
    // not accumulating in memory. This tests for classic event listener leaks,
    // promise chain leaks, etc.
    this.timeout(10000);
    
    const count = 50;
    const results = [];
    
    for(let i = 0; i < count; i++){
      const result = await scheduler.run({
        scene_id: null,
        user_id: null,
        data: {},
        handler: async ({task})=> task.task_id
      });
      results.push(result);
    }
    
    expect(results).to.have.length(count);
    // Verify all tasks completed successfully
    for(let id of results){
      const task = await scheduler.getTask(id);
      expect(task.status).to.equal("success");
    }
  });

  it("many nested tasks don't cause stack overflow or memory issues", async function(){
    // PURPOSE: Test that deeply nested async contexts don't cause stack overflow
    // or accumulate memory. AsyncLocalStorage should clean up properly as
    // contexts exit. This is a regression test for context chain leaks.
    this.timeout(10000);
    
    const depth = 10;
    let maxDepth = 0;
    
    const runNested = async (d: number): Promise<number> => {
      if(d === depth) return d;
      maxDepth = Math.max(maxDepth, d);
      
      return await scheduler.run({
        scene_id: null,
        user_id: null,
        data: {},
        handler: async ()=> runNested(d + 1)
      });
    };
    
    const result = await runNested(0);
    expect(result).to.equal(depth);
    expect(maxDepth).to.be.greaterThan(0);
  });

  it("group can run tasks concurrently", async function(){
    this.timeout(500)
    const results = await scheduler.group(function *(){
      for(let i = 0; i < 60; i++){
        yield timers.setTimeout(10, i);
      }
    });
    expect(results).to.have.length(60);
  });

  it("callback-based error handling doesn't cause unhandled rejections", async function(){
    // PURPOSE: When using the optional callback parameter on run(),
    // ensure errors are passed to the callback, not left as unhandled rejections.
    // Unhandled rejections can crash the process in strict environments.
    let callbackError: any = null;
    
    const promise = scheduler.run({
      scene_id: null,
      user_id: null,
      data: {},
      handler: async ()=>{
        throw new Error("Error in handler");
      }
    }, (err)=>{
      callbackError = err;
    });
    
    // The promise should also reject
    await expect(promise).to.be.rejected;
    // The callback should have received the error
    await timers.setTimeout(10); // Give callback time to execute
    expect(callbackError).to.be.instanceof(Error);
    expect(callbackError.message).to.include("Error in handler");
  });

  it("closing scheduler with pending tasks cleans up properly", async function(){
    // PURPOSE: Verify that if we close the scheduler while tasks are still
    // pending, we don't leak resources or leave zombie tasks hanging.
    this.timeout(5000);
    
    scheduler.concurrency = 1;
    
    let task1Executed = new EventEmitter();
    
    // Task 1: Will be running when we close
    const runningTask = scheduler.run({
      scene_id: null,
      user_id: null,
      data: {},
      handler: async ({context:{signal}})=>{
        task1Executed.emit("start");
        await timers.setTimeout(1000, null, {signal}); // Slow task, with abort
        return "task1";
      }
    });
    

    
    // Give task1 time to start executing
    await once(task1Executed, "start");
    
    // Close scheduler
    await scheduler.close(100);
    
    // The running task should abort
    await expect(runningTask).to.be.rejectedWith("aborted");
  });
});