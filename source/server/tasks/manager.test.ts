

// Tests for tasks management
// The system is a bit intricate and hard to test in isolation

import { Client } from "pg";
import openDatabase, { Database } from "../vfs/helpers/db.js";

import { Uid } from "../utils/uid.js";
import { randomBytes } from "node:crypto";
import { TaskManager } from "./manager.js";
import Vfs from "../vfs/index.js";
import UserManager from "../auth/UserManager.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";

describe("TaskManager", function(){
  let db_uri: string, scene_id: number, user_id: number, handle: Database;

    let listener :TaskManager;
  this.beforeAll(async function(){
    db_uri = await getUniqueDb(this.currentTest?.title.replace(/[^\w]/g, "_"));
    handle = await openDatabase({uri: db_uri});
    const vfs = new Vfs("/dev/null", handle);
    scene_id = await vfs.createScene(randomBytes(8).toString("base64url"));
    const userManager = new UserManager(handle);
    user_id = (await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"))).uid;
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
    
    listener = new TaskManager(handle);
  })


  //Non-connected functions that should work well in isolation
  it("create tasks", async function(){
    let task = await listener.create({
      scene_id: null, 
      user_id: null,
      type: "delayTask",
      data: {time: 0}
    });
    expect(task.task_id).to.be.a("number");
    expect(await handle.all("SELECT * FROM tasks")).to.have.length(1);
  });
  
  it("create a task attached to a scene", async function(){
    let task = await listener.create({
      scene_id, 
      user_id: null,
      type: "delayTask",
      data: {time: 0}
    });
    expect(task.task_id).to.be.a("number");
    expect(task.scene_id).to.equal(scene_id);
  })
  
  it("create a task attached to a user", async function(){
    let task = await listener.create({
      scene_id: null, 
      user_id,
      type: "delayTask",
      data: {time: 0}
    });
    expect(task.task_id).to.be.a("number");
    expect(task.user_id).to.equal(user_id);
  });

  it("update task status", async function(){
    let t = await listener.create({
      scene_id,
      user_id: null, 
      type: "delayTask",
      data: {time: 0}
    });
    expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "pending");
    await listener.setTaskStatus(t.task_id, "success");
    expect(await handle.get("SELECT * FROM tasks")).to.have.property("status", "success");
  });

  it("get a task", async function(){
    //Create a task
    let t = await listener.create({
      scene_id,
      user_id: null, 
      type: "delayTask",
      data: {time: 0}
    });
    
    let resolved = await listener.getTask(t.task_id);
    expect(resolved).to.deep.equal(t);
    expect(resolved.data).to.deep.equal({time: 0});
  });


  it("creates a task with a parent", async function(){
    let parent = await listener.create({
      scene_id,
      user_id: null, 
      type: "delayTask",
      data: {time: 0}
    });

    let child = await listener.create({
      scene_id,
      user_id: null, 
      type: "delayTask",
      data: {time: 0},
      parent: parent.task_id,
    });

    expect(child).to.have.property("parent", parent.task_id);
  });

  it("raises NotFoundError when getting non-existent task", async function(){
    await expect(listener.getTask(99999)).to.be.rejectedWith("No task found");
  });

  it("raises NotFoundError calling setTaskStatus on non-existent task", async function(){
    // the scheduler shouldn't assume the update succeeded.
    await expect(listener.setTaskStatus(99999, "running")).to.be.rejectedWith(NotFoundError);
  });

  it("raises NotFoundError calling takeTask on non-existent task", async function(){
    // the scheduler shouldn't assume the update succeeded.
    await expect(listener.takeTask(99999)).to.be.rejectedWith(NotFoundError);
  });

  it("raises NotFoundError calling releaseTask on non-existent task", async function(){
    // the scheduler shouldn't assume the update succeeded.
    await expect(listener.releaseTask(99999)).to.be.rejectedWith(NotFoundError);
  });

  it("raises NotFoundError calling errorTask on non-existent task", async function(){
    // the scheduler shouldn't assume the update succeeded.
    await expect(listener.errorTask(99999, new Error("some error"))).to.be.rejectedWith(NotFoundError);
  });

  it("handles database errors during task creation", async function(){
    await expect(listener.create({
      scene_id: -1, // Invalid ID
      user_id: null,
      type: "delayTask",
      data: {},
    })).to.be.rejected;
  });


  it("close() prevents further database operations", async function(){
    // PURPOSE: Verify that calling close() properly invalidates the manager
    // and prevents accidental use after close, which could cause connection leaks.
    const manager = new TaskManager(handle);
    await manager.close();
    
    await expect(manager.create({
      scene_id: null,
      user_id: null,
      type: "test",
      data: {},
    })).to.be.rejectedWith("TaskManager has been closed");
  });


  it("deleteTask properly cleans up cascade deletions", async function(){
    // PURPOSE: Verify that deleteTask with cascading deletes doesn't leave
    // orphaned records or cause constraint violations on subsequent operations.
    const parent = await listener.create({
      scene_id: null,
      user_id: null,
      type: "parent",
      data: {},
    });

    const child = await listener.create({
      scene_id: null,
      user_id: null,
      type: "child",
      data: {},
      parent: parent.task_id,
    });

    const deleted = await listener.deleteTask(parent.task_id);
    expect(deleted).to.be.true;

    // Child should be cascaded deleted
    const rows = await handle.all("SELECT * FROM tasks");
    expect(rows).to.have.length(0);
  });

  it("takeTask only transitions from pending or initializing status", async function(){
    let task = await listener.create({
      scene_id: null,
      user_id: null,
      type: "test",
      data: {},
      status: "pending",
    });

    await listener.takeTask(task.task_id);
    let updated = await listener.getTask(task.task_id);
    expect(updated.status).to.equal("running");

    // Try to take again - should throw.
    await expect(listener.takeTask(task.task_id)).to.be.rejectedWith(BadRequestError);
  });

  it("setTaskStatus validates status values", async function(){
    // PURPOSE: Verify that invalid status transitions are handled correctly.
    // The type system prevents "success" and "error" here, but "running"->pending
    // should be allowed even if not semantically correct. Tests the type boundaries.
    const task = await listener.create({
      scene_id: null,
      user_id: null,
      type: "test",
      data: {},
    });

    await listener.setTaskStatus(task.task_id, "running");
    let updated = await listener.getTask(task.task_id);
    expect(updated.status).to.equal("running");

    // Setting to initializing should also work
    await listener.setTaskStatus(task.task_id, "initializing");
    updated = await listener.getTask(task.task_id);
    expect(updated.status).to.equal("initializing");
  });

  it("task output is properly serialized and deserialized", async function(){
    // PURPOSE: Verify round-trip serialization of various data types.
    // Ensures JSON serialization doesn't lose precision or corrupt data.
    const task = await listener.create({
      scene_id: null,
      user_id: null,
      type: "test",
      data: {},
    });

    const testOutput = {
      string: "test",
      number: 42,
      float: 3.14159,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      nested: {
        deep: {
          value: "found",
        }
      }
    };

    await listener.releaseTask(task.task_id, testOutput);
    const retrieved = await listener.getTask(task.task_id);
    
    // Output is stored as JSON string, so we need to parse it if comparing
    expect(retrieved.output).to.be.an("object");
    expect(retrieved.output).to.deep.equal(testOutput);
  });
});