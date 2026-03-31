import { Writable, PassThrough } from "node:stream";
import timers from "node:timers/promises";
import { createBatcher, createInserter, createLogger } from "./logger.js";
import openDatabase, { Database, DatabaseHandle } from "../vfs/helpers/db.js";
import { LogSeverity } from "./types.js";
import { randomBytes } from "node:crypto";
import Vfs from "../vfs/index.js";
import UserManager from "../auth/UserManager.js";

/**
 * Helper: collect all batches emitted by a batcher into an array
 */
function collectBatches(batcher: ReturnType<typeof createBatcher>) {
  const batches: Array<Array<{ severity: LogSeverity; message: string }>> = [];
  const sink = new Writable({
    objectMode: true,
    write(chunk, _, cb) {
      batches.push(chunk);
      cb();
    }
  });
  batcher.pipe(sink);
  return { batches, sink };
}

describe("createBatcher", function () {

  it("flushes when batch reaches batchSize", async function () {
    const batcher = createBatcher(3, 5000); // large debounce so only count triggers
    const { batches, sink } = collectBatches(batcher);

    for (let i = 0; i < 3; i++) {
      batcher.write({ severity: "log" as LogSeverity, message: `msg${i}` });
    }

    // Batch should have been pushed synchronously
    expect(batches).to.have.length(1);
    expect(batches[0]).to.have.length(3);

    batcher.end();
    await new Promise<void>((res) => sink.on("finish", res));
  });

  it("flushes on debounce timeout", async function () {
    const batcher = createBatcher(100, 30); // small debounce
    const { batches, sink } = collectBatches(batcher);

    batcher.write({ severity: "log" as LogSeverity, message: "hello" });
    expect(batches, "should not have flushed synchronously").to.have.length(0);

    await timers.setTimeout(60); // wait for debounce
    expect(batches, "should have flushed after debounce").to.have.length(1);
    expect(batches[0]).to.have.length(1);

    batcher.end();
    await new Promise<void>((res) => sink.on("finish", res));
  });

  it("end() flushes remaining buffer even when timer has not fired", async function () {
    const batcher = createBatcher(100, 5000); // neither count nor timer should trigger naturally
    const { batches, sink } = collectBatches(batcher);

    batcher.write({ severity: "log" as LogSeverity, message: "a" });
    batcher.write({ severity: "log" as LogSeverity, message: "b" });
    expect(batches).to.have.length(0);

    batcher.end();
    await new Promise<void>((res) => sink.on("finish", res));
    expect(batches).to.have.length(1);
    expect(batches[0]).to.have.length(2);
  });

  it("end() with empty buffer still completes the pipeline", async function () {
    const batcher = createBatcher(10, 100);
    const { sink } = collectBatches(batcher);

    // No writes at all
    batcher.end();
    await new Promise<void>((res) => sink.on("finish", res));
  });

  it("end() after timer has already fired completes cleanly", async function () {
    const batcher = createBatcher(100, 20);
    const { batches, sink } = collectBatches(batcher);

    batcher.write({ severity: "log" as LogSeverity, message: "early" });

    // Wait for timer to fire
    await timers.setTimeout(50);
    expect(batches).to.have.length(1);

    // Now end with empty buffer
    batcher.end();
    await new Promise<void>((res) => sink.on("finish", res));
    // No extra batch should have been pushed
    expect(batches).to.have.length(1);
  });

  it("end() right after write completes without hanging", async function () {
    // This tests the exact scenario in the scheduler: write a message, then
    // immediately end the batcher before the timer fires.
    this.timeout(500);
    const batcher = createBatcher(10, 100);
    const { batches, sink } = collectBatches(batcher);

    batcher.write({ severity: "debug" as LogSeverity, message: "schedule child" });
    batcher.end();

    await new Promise<void>((res) => sink.on("finish", res));
    expect(batches).to.have.length(1);
    expect(batches[0]).to.have.length(1);
  });

  it("multiple rapid writes followed by end() don't lose data", async function () {
    const batcher = createBatcher(5, 100);
    const { batches, sink } = collectBatches(batcher);

    for (let i = 0; i < 12; i++) {
      batcher.write({ severity: "log" as LogSeverity, message: `msg${i}` });
    }
    batcher.end();
    await new Promise<void>((res) => sink.on("finish", res));

    // 5 + 5 full batches + 2 remaining = 3 batches
    const totalMessages = batches.reduce((sum, b) => sum + b.length, 0);
    expect(totalMessages).to.equal(12);
  });
  it("completes end() even if downstream is slow", async function () {
    this.timeout(2000);

    const batcher = createBatcher(10, 50);
    const batches: any[] = [];

    const slowSink = new Writable({
      objectMode: true,
      write(chunk, _, cb) {
        batches.push(chunk);
        // Simulate slow processing (like a DB write)
        setTimeout(cb, 100);
      }
    });
    batcher.pipe(slowSink);

    // Write some data, triggering a timer
    batcher.write({ severity: "log" as LogSeverity, message: "slow1" });

    // Wait for the timer to fire and the slow write to start
    await timers.setTimeout(80);

    // Now end (while possibly a write is in progress on the sink)
    batcher.end();

    await new Promise<void>((resolve, reject) => {
      slowSink.on("finish", resolve);
      slowSink.on("error", reject);
    });

    const totalMessages = batches.reduce((sum: number, b: any[]) => sum + b.length, 0);
    expect(totalMessages).to.equal(1);
  });
});


describe("createBatcher error propagation", function () {
  /**
   * Regression test for error forwarding in logger/batcher
   * This test would time out without the error handler.
   */
  it("batcher error is forwarded to the sink when an error handler bridges them", function (done) {
    this.timeout(500);

    const batcher = createBatcher(10, 5000);

    const sink = new Writable({
      objectMode: true,
      write(_chunk, _enc, cb) { cb(); },
    });

    batcher.pipe(sink);
    // This is the line under test — remove it and this test hangs until timeout
    batcher.on("error", (err) => sink.destroy(err));

    sink.on("error", (err) => {
      expect(err.message).to.equal("simulated batcher failure");
      done();
    });

    batcher.destroy(new Error("simulated batcher failure"));
  });
});

describe("createLogger (integration)", function () {
  let db_uri: string, handle: Database, task_id: number;

  this.beforeAll(async function () {
    db_uri = await getUniqueDb("logger_test");
    handle = await openDatabase({ uri: db_uri });
    const vfs = new Vfs("/dev/null", handle);
    const userManager = new UserManager(handle);
    const user = await userManager.addUser("logger_tester", "12345678", "admin");
    const scene_id = await vfs.createScene(randomBytes(8).toString("base64url"), user.uid);
  });

  this.afterAll(async function () {
    await handle?.end();
    await dropDb(db_uri);
  });

  this.beforeEach(async function () {
    await handle.run(`DELETE FROM tasks_logs`);
    await handle.run(`DELETE FROM tasks`);
    // Create a fresh task for each test
    const result = await handle.all<{ task_id: number }>(
      `INSERT INTO tasks(type, status) VALUES ('test', 'running') RETURNING task_id`
    );
    task_id = result[0].task_id;
  });

  it("dispose with no logs resolves quickly", async function () {
    this.timeout(500);
    const logger = createLogger(handle, task_id);
    await (logger as any)[Symbol.asyncDispose]();
  });

  it("dispose with a few logs resolves", async function () {
    this.timeout(1000);
    const logger = createLogger(handle, task_id);

    logger.log("msg1");
    logger.log("msg2");
    logger.debug("msg3");

    await (logger as any)[Symbol.asyncDispose]();

    // Verify logs were actually inserted
    const logs = await handle.all(
      `SELECT severity, message FROM tasks_logs WHERE fk_task_id = $1 ORDER BY log_id`,
      [task_id]
    );
    expect(logs).to.have.length(3);
    expect(logs[0].message).to.equal("msg1");
  });


  it("dispose right after write completes without hanging", async function () {
    // This mimics the scheduler scenario: write a log, then immediately dispose
    this.timeout(500);
    const logger = createLogger(handle, task_id);
    logger.debug("schedule child task");

    await (logger as any)[Symbol.asyncDispose]();

    const logs = await handle.all(
      `SELECT message FROM tasks_logs WHERE fk_task_id = $1`,
      [task_id]
    );
    expect(logs).to.have.length(1);
  });

  it("many rapid log entries don't lose data", async function () {
    this.timeout(2000);
    const logger = createLogger(handle, task_id);

    for (let i = 0; i < 25; i++) {
      logger.log(`message ${i}`);
    }

    await (logger as any)[Symbol.asyncDispose]();

    const logs = await handle.all(
      `SELECT message FROM tasks_logs WHERE fk_task_id = $1`,
      [task_id]
    );
    expect(logs).to.have.length(25);
  });

  it("multiple loggers for different tasks dispose independently", async function () {
    this.timeout(1000);

    // Create a second task
    const result = await handle.all<{ task_id: number }>(
      `INSERT INTO tasks(type, status) VALUES ('test2', 'running') RETURNING task_id`
    );
    const task_id2 = result[0].task_id;

    const logger1 = createLogger(handle, task_id);
    const logger2 = createLogger(handle, task_id2);

    logger1.log("from logger1");
    logger2.log("from logger2");

    await (logger1 as any)[Symbol.asyncDispose]();
    await (logger2 as any)[Symbol.asyncDispose]();

    const [logs1, logs2] = await Promise.all([
      handle.all(`SELECT message FROM tasks_logs WHERE fk_task_id = $1`, [task_id]),
      handle.all(`SELECT message FROM tasks_logs WHERE fk_task_id = $1`, [task_id2]),
    ]);
    expect(logs1).to.have.length(1);
    expect(logs2).to.have.length(1);
  });

  it("multiple loggers disposing concurrently don't deadlock", async function () {
    this.timeout(2000);

    const taskIds: number[] = [task_id];
    for (let i = 0; i < 4; i++) {
      const result = await handle.all<{ task_id: number }>(
        `INSERT INTO tasks(type, status) VALUES ('test_concurrent', 'running') RETURNING task_id`
      );
      taskIds.push(result[0].task_id);
    }

    const loggers = taskIds.map(id => createLogger(handle, id));

    // Write to all loggers
    for (let i = 0; i < loggers.length; i++) {
      loggers[i].log(`log from ${i}`);
      loggers[i].debug(`debug from ${i}`);
    }

    // Dispose all concurrently
    await Promise.all(loggers.map(l => (l as any)[Symbol.asyncDispose]()));
  });
});
