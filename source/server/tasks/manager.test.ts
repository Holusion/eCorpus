

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
    await handle.run(`DELETE FROM tasks`);
    //No need to clean logs because they have a ON DELETE CASCADE relation
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

  describe("getTaskTree()", function(){
    it("returns the root task with empty logs when there are none", async function(){
      const root = await listener.create({scene_id: null, user_id: null, type: "root", data: {}});
      const {root: rootNode, logs} = await listener.getTaskTree(root.task_id);

      expect(logs).to.deep.equal([]);
      expect(rootNode.task_id).to.equal(root.task_id);
      expect(rootNode.children).to.deep.equal([]);
    });

    it("throws NotFoundError for a non-existent task id", async function(){
      await expect(listener.getTaskTree(99999)).to.be.rejectedWith(NotFoundError);
    });

    it("returns logs for a single task, ordered by log_id ASC", async function(){
      const root = await listener.create({scene_id: null, user_id: null, type: "root", data: {}});

      await handle.run(
        `INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'first'), ($1, 'warn', 'second')`,
        [root.task_id]
      );

      const {root: rootNode, logs} = await listener.getTaskTree(root.task_id);

      expect(rootNode.children).to.deep.equal([]);
      expect(logs).to.have.length(2);
      expect(logs[0].message).to.equal("first");
      expect(logs[1].message).to.equal("second");
      expect(logs[0].log_id).to.be.lessThan(logs[1].log_id);
      expect(logs[0].task_id).to.equal(root.task_id);
      expect(logs[1].task_id).to.equal(root.task_id);
    });

    it("returns parent and direct children with their respective logs", async function(){
      const root = await listener.create({scene_id: null, user_id: null, type: "root", data: {}});
      const child1 = await listener.create({scene_id: null, user_id: null, type: "child", data: {}, parent: root.task_id});
      const child2 = await listener.create({scene_id: null, user_id: null, type: "child", data: {}, parent: root.task_id});

      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'root-log')`, [root.task_id]);
      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'child1-log')`, [child1.task_id]);
      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'error', 'child2-log')`, [child2.task_id]);

      const {root: rootNode, logs} = await listener.getTaskTree(root.task_id);

      // All logs present, ordered by log_id
      expect(logs).to.have.length(3);
      const logIds = logs.map(l => l.log_id);
      expect(logIds).to.deep.equal([...logIds].sort((a, b) => a - b));

      // Root node carries both children
      expect(rootNode.children.map(c => c.task_id).sort()).to.deep.equal([child1.task_id, child2.task_id].sort());

      // Children carry the parent id and no children of their own
      const childNode1 = rootNode.children.find(c => c.task_id === child1.task_id)!;
      expect(childNode1.parent).to.equal(root.task_id);
      expect(childNode1.children).to.deep.equal([]);
    });

    it("fetches deeply nested (grandchild) tasks recursively", async function(){
      const root  = await listener.create({scene_id: null, user_id: null, type: "root",       data: {}});
      const child = await listener.create({scene_id: null, user_id: null, type: "child",      data: {}, parent: root.task_id});
      const grand = await listener.create({scene_id: null, user_id: null, type: "grandchild", data: {}, parent: child.task_id});

      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'grand-log')`, [grand.task_id]);

      const {root: rootNode, logs} = await listener.getTaskTree(root.task_id);

      // Log comes from the grandchild
      expect(logs).to.have.length(1);
      expect(logs[0].task_id).to.equal(grand.task_id);

      // Graph is properly linked: root -> child -> grandchild
      expect(rootNode.children).to.have.length(1);
      const childNode = rootNode.children[0];
      expect(childNode.task_id).to.equal(child.task_id);
      expect(childNode.children).to.have.length(1);
      expect(childNode.children[0].task_id).to.equal(grand.task_id);
    });

    it("does not include tasks outside the requested subtree", async function(){
      const root     = await listener.create({scene_id: null, user_id: null, type: "root",    data: {}});
      const child    = await listener.create({scene_id: null, user_id: null, type: "child",   data: {}, parent: root.task_id});
      const unrelated = await listener.create({scene_id: null, user_id: null, type: "other",  data: {}});

      // Fetching only the child subtree should not include root or unrelated
      const {root: subtreeRoot} = await listener.getTaskTree(child.task_id);
      expect(subtreeRoot.task_id).to.equal(child.task_id);
      expect(subtreeRoot.parent).to.equal(root.task_id); // parent id is preserved
      expect(subtreeRoot.children).to.deep.equal([]);    // but parent node is not included
    });

    it("logs from all tasks in the tree are merged and sorted by log_id", async function(){
      const root  = await listener.create({scene_id: null, user_id: null, type: "root",  data: {}});
      const child = await listener.create({scene_id: null, user_id: null, type: "child", data: {}, parent: root.task_id});

      // Interleave inserts from different tasks to test global ordering
      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'a')`, [root.task_id]);
      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'b')`, [child.task_id]);
      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'c')`, [root.task_id]);

      const {logs} = await listener.getTaskTree(root.task_id);

      expect(logs).to.have.length(3);
      const logIds = logs.map(l => l.log_id);
      expect(logIds).to.deep.equal([...logIds].sort((a, b) => a - b));
      expect(logs.map(l => l.message)).to.deep.equal(['a', 'b', 'c']);
    });

    it("filters logs by minimum severity level", async function(){
      const root = await listener.create({scene_id: null, user_id: null, type: "root", data: {}});

      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'debug', 'msg-debug')`, [root.task_id]);
      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log',   'msg-log')`,   [root.task_id]);
      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'warn',  'msg-warn')`,  [root.task_id]);
      await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'error', 'msg-error')`, [root.task_id]);

      // no filter → all four lines
      const {logs: all} = await listener.getTaskTree(root.task_id);
      expect(all.map(l => l.message)).to.deep.equal(['msg-debug', 'msg-log', 'msg-warn', 'msg-error']);

      // level: 'log' → excludes 'debug'
      const {logs: fromLog} = await listener.getTaskTree(root.task_id, {level: 'log'});
      expect(fromLog.map(l => l.message)).to.deep.equal(['msg-log', 'msg-warn', 'msg-error']);

      // level: 'warn' → only warn and error
      const {logs: fromWarn} = await listener.getTaskTree(root.task_id, {level: 'warn'});
      expect(fromWarn.map(l => l.message)).to.deep.equal(['msg-warn', 'msg-error']);

      // level: 'error' → only errors
      const {logs: fromError} = await listener.getTaskTree(root.task_id, {level: 'error'});
      expect(fromError.map(l => l.message)).to.deep.equal(['msg-error']);
    });

    describe("cycles handling", function(){
      // cycles shouldn't ever happen
      // but there is no built-in cycle prevention in the table: only safeguards on `setTaskParent` 
      // we don't want to crash the server if a bug ever allows one

      it("root is undefined when every node in the result has a parent in the tree", async function(){
        // In a pure cycle every node's parent IS in taskMap, so the wiring loop never
        // finds a node without a known parent — root is left undefined.
        const a = await listener.create({scene_id: null, user_id: null, type: "cycle-a", data: {}});
        const b = await listener.create({scene_id: null, user_id: null, type: "cycle-b", data: {}, parent: a.task_id});
        await handle.run(`UPDATE tasks SET parent = $1 WHERE task_id = $2`, [b.task_id, a.task_id]);

        const {root} = await listener.getTaskTree(a.task_id);
        expect(root).to.be.undefined;
      });

      it("collects logs from all reachable nodes including normal children of cyclic nodes", async function(){
        // A↔B is the cycle; C is a regular child of A (no cycle involvement).
        // Logs from all three must appear in the result even though root is undefined.
        const a = await listener.create({scene_id: null, user_id: null, type: "cycle-a", data: {}});
        const b = await listener.create({scene_id: null, user_id: null, type: "cycle-b", data: {}, parent: a.task_id});
        const c = await listener.create({scene_id: null, user_id: null, type: "normal-c", data: {}, parent: a.task_id});
        await handle.run(`UPDATE tasks SET parent = $1 WHERE task_id = $2`, [b.task_id, a.task_id]);

        await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'log-a')`, [a.task_id]);
        await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'log-b')`, [b.task_id]);
        await handle.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, 'log', 'log-c')`, [c.task_id]);

        const {logs} = await listener.getTaskTree(a.task_id);
        expect(logs.map(l => l.message).sort()).to.deep.equal(['log-a', 'log-b', 'log-c']);
      });
    });
  });


  describe("setTaskScene()", function(){
    it("sets scene_id on a task that has none", async function(){
      const task = await listener.create({scene_id: null, user_id: null, type: "test", data: {}});
      await listener.setTaskScene(task.task_id, scene_id);
      const updated = await listener.getTask(task.task_id);
      expect(updated.scene_id).to.equal(scene_id);
    });

    it("throws NotFoundError for a non-existent task id", async function(){
      await expect(listener.setTaskScene(99999, scene_id)).to.be.rejectedWith(NotFoundError);
    });

    it("throws BadRequestError when scene_id is already set", async function(){
      const task = await listener.create({scene_id, user_id: null, type: "test", data: {}});
      await expect(listener.setTaskScene(task.task_id, scene_id)).to.be.rejectedWith(BadRequestError);
    });

    it("throws BadRequestError on a second call even with the same scene value", async function(){
      const task = await listener.create({scene_id: null, user_id: null, type: "test", data: {}});
      await listener.setTaskScene(task.task_id, scene_id);
      // Second call must be rejected even though the value is identical
      await expect(listener.setTaskScene(task.task_id, scene_id)).to.be.rejectedWith(BadRequestError);
    });

    it("sets scene_id on a task whose parent has no scene", async function(){
      const parent = await listener.create({scene_id: null, user_id: null, type: "parent", data: {}});
      const child  = await listener.create({scene_id: null, user_id: null, type: "child",  data: {}, parent: parent.task_id});
      await listener.setTaskScene(child.task_id, scene_id);
      const updated = await listener.getTask(child.task_id);
      expect(updated.scene_id).to.equal(scene_id);
    });

    it("throws BadRequestError when the task's parent already has a scene", async function(){
      const parent = await listener.create({scene_id, user_id: null, type: "parent", data: {}});
      const child  = await listener.create({scene_id: null, user_id: null, type: "child", data: {}, parent: parent.task_id});
      await expect(listener.setTaskScene(child.task_id, scene_id)).to.be.rejectedWith(BadRequestError);
    });
  });

  describe("setTaskParent()", function(){
    it("sets parent on a task that has none", async function(){
      const parent = await listener.create({scene_id: null, user_id: null, type: "parent", data: {}});
      const child  = await listener.create({scene_id: null, user_id: null, type: "child",  data: {}});
      await listener.setTaskParent(child.task_id, parent.task_id);
      const updated = await listener.getTask(child.task_id);
      expect(updated.parent).to.equal(parent.task_id);
    });

    it("throws NotFoundError for a non-existent task id", async function(){
      const parent = await listener.create({scene_id: null, user_id: null, type: "parent", data: {}});
      await expect(listener.setTaskParent(99999, parent.task_id)).to.be.rejectedWith(NotFoundError);
    });

    it("throws BadRequestError when parent is already set", async function(){
      const p1 = await listener.create({scene_id: null, user_id: null, type: "p", data: {}});
      const p2 = await listener.create({scene_id: null, user_id: null, type: "p", data: {}});
      const child = await listener.create({scene_id: null, user_id: null, type: "child", data: {}, parent: p1.task_id});
      await expect(listener.setTaskParent(child.task_id, p2.task_id)).to.be.rejectedWith(BadRequestError);
    });

    it("throws BadRequestError when parent === id (self-reference)", async function(){
      const task = await listener.create({scene_id: null, user_id: null, type: "test", data: {}});
      await expect(listener.setTaskParent(task.task_id, task.task_id)).to.be.rejectedWith(BadRequestError);
    });

    it("throws an error when the referenced parent task does not exist (FK violation)", async function(){
      const task = await listener.create({scene_id: null, user_id: null, type: "test", data: {}});
      await expect(listener.setTaskParent(task.task_id, 99999)).to.be.rejected;
    });

    describe("cycle prevention", function(){
      it("2-node cycle: A → B → A", async function(){
        // A.parent = null initially; B.parent = A (created normally).
        // setTaskParent(A, B) closes the cycle: A↔B.
        const a = await listener.create({scene_id: null, user_id: null, type: "cycle-a", data: {}});
        const b = await listener.create({scene_id: null, user_id: null, type: "cycle-b", data: {}, parent: a.task_id});
        await expect(listener.setTaskParent(a.task_id, b.task_id)).to.be.rejectedWith(BadRequestError);
      });

      it("3-node cycle: A→B→C→A", async function(){
        const a = await listener.create({scene_id: null, user_id: null, type: "cycle-a", data: {}});
        const b = await listener.create({scene_id: null, user_id: null, type: "cycle-b", data: {}});
        const c = await listener.create({scene_id: null, user_id: null, type: "cycle-c", data: {}});
        await listener.setTaskParent(b.task_id, a.task_id); // B.parent = A
        await listener.setTaskParent(c.task_id, b.task_id); // C.parent = B
        await expect(listener.setTaskParent(a.task_id, c.task_id)).to.be.rejectedWith(BadRequestError); // A.parent = C ← closes cycle
      });
    });
  });

  describe("getTasks()", function(){
    it("returns only root tasks by default when filtering by user", async function(){
      const root = await listener.create({scene_id: null, user_id, type: "root", data: {}});
      const child = await listener.create({scene_id: null, user_id, type: "child", data: {}, parent: root.task_id});

      const tasks = await listener.getTasks({ user_id });
      expect(tasks).to.have.length(1);
      expect(tasks[0].task_id).to.equal(root.task_id);
    });

    it("returns child tasks as well when rootOnly is false", async function(){
      const root = await listener.create({scene_id: null, user_id, type: "root", data: {}});
      const child = await listener.create({scene_id: null, user_id, type: "child", data: {}, parent: root.task_id});

      const tasks = await listener.getTasks({ user_id, rootOnly: false });
      // both root and child should be returned
      const ids = tasks.map(t => t.task_id).sort((a,b)=>a-b);
      expect(ids).to.deep.equal([root.task_id, child.task_id].sort((a,b)=>a-b));
    });

    it("applies exact type matching", async function(){
      const a = await listener.create({scene_id: null, user_id, type: "delayTask", data: {}});
      const b = await listener.create({scene_id: null, user_id, type: "other", data: {}});

      const tasks = await listener.getTasks({ user_id, type: 'delayTask' });
      expect(tasks).to.have.length(1);
      expect(tasks[0].type).to.equal('delayTask');
    });

    describe("pagination", function(){
      it("limits results to `limit` tasks", async function(){
        for(let i = 0; i < 5; i++){
          await listener.create({scene_id: null, user_id, type: "t", data: {}});
        }
        const tasks = await listener.getTasks({ user_id, limit: 3 });
        expect(tasks).to.have.length(3);
      });

      it("skips the first `offset` tasks", async function(){
        const a = await listener.create({scene_id: null, user_id, type: "t", data: {}});
        const b = await listener.create({scene_id: null, user_id, type: "t", data: {}});
        const c = await listener.create({scene_id: null, user_id, type: "t", data: {}});
        // ordered DESC by task_id, so page 2 (offset=1, limit=2) skips the newest
        const page1 = await listener.getTasks({ user_id, limit: 2, offset: 0 });
        const page2 = await listener.getTasks({ user_id, limit: 2, offset: 2 });
        expect(page1).to.have.length(2);
        expect(page2).to.have.length(1);
        // together they cover all three ids
        const allIds = [...page1, ...page2].map(t => t.task_id).sort((a,b)=>a-b);
        expect(allIds).to.deep.equal([a.task_id, b.task_id, c.task_id].sort((a,b)=>a-b));
      });

      it("returns an empty array when offset exceeds total", async function(){
        await listener.create({scene_id: null, user_id, type: "t", data: {}});
        const tasks = await listener.getTasks({ user_id, offset: 100 });
        expect(tasks).to.have.length(0);
      });

      it("rejects a non-integer limit", async function(){
        await expect(listener.getTasks({ limit: 1.5 })).to.be.rejectedWith(BadRequestError);
      });

      it("rejects a zero limit", async function(){
        await expect(listener.getTasks({ limit: 0 })).to.be.rejectedWith(BadRequestError);
      });

      it("rejects a negative limit", async function(){
        await expect(listener.getTasks({ limit: -1 })).to.be.rejectedWith(BadRequestError);
      });

      it("rejects a limit above 100", async function(){
        await expect(listener.getTasks({ limit: 101 })).to.be.rejectedWith(BadRequestError);
      });

      it("rejects a non-integer offset", async function(){
        await expect(listener.getTasks({ offset: 0.5 })).to.be.rejectedWith(BadRequestError);
      });

      it("rejects a negative offset", async function(){
        await expect(listener.getTasks({ offset: -1 })).to.be.rejectedWith(BadRequestError);
      });

      it("accepts limit=100 (boundary)", async function(){
        await expect(listener.getTasks({ limit: 100 })).to.be.fulfilled;
      });

      it("accepts offset=0 (boundary)", async function(){
        await expect(listener.getTasks({ offset: 0 })).to.be.fulfilled;
      });
    });
  });
});
