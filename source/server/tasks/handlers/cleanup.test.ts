import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";

import openDatabase, { Database } from "../../vfs/helpers/db.js";
import Vfs from "../../vfs/index.js";
import UserManager from "../../auth/UserManager.js";
import { Config } from "../../utils/config.js";
import { TaskScheduler } from "../scheduler.js";
import {
  cleanOldTasks,
  cleanLooseObjects,
  checkForMissingObjects,
  cleanTaskArtifacts,
  optimize,
  runCleanup,
} from "./cleanup.js";


async function* dataStream(src: Array<Buffer|string> = ["foo", "\n"]) {
  for (const d of src) {
    yield Buffer.isBuffer(d) ? d : Buffer.from(d);
  }
}


describe("cleanup handlers", function () {
  let db_uri: string, handle: Database;
  let scheduler: TaskScheduler;
  let vfs: Vfs;
  let config: Config;
  let rootDir: string;

  this.beforeAll(async function () {
    db_uri = await getUniqueDb("ecorpus_cleanup_handlers_unit_tests");
    handle = await openDatabase({ uri: db_uri });
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ecorpus-cleanup-"));
    vfs = await Vfs.Open(rootDir, { db: handle, forceMigration: false });
    // No env override so tests can flip retention via config.set()
    config = await Config.open(handle, {});
  });

  this.afterAll(async function () {
    Config.close();
    await handle?.end();
    await fs.rm(rootDir, { recursive: true, force: true });
    await dropDb(db_uri);
  });

  this.beforeEach(async function () {
    const userManager = new UserManager(handle);
    scheduler = new TaskScheduler({ db: handle, vfs, userManager, config });
    await config.set("task_retention_days", 30);
    await config.set("task_errors_retention_days", 90);
  });

  this.afterEach(async function () {
    await handle.run(`DELETE FROM tasks_logs`);
    await handle.run(`DELETE FROM tasks`);
    await handle.run(`DELETE FROM scenes`);
    // Clear out the artifacts directory between tests
    try {
      const entries = await fs.readdir(vfs.artifactsDir);
      await Promise.all(entries.map(e => fs.rm(path.join(vfs.artifactsDir, e), { recursive: true, force: true })));
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    if (!scheduler.closed) await scheduler.close();
  });

  describe("cleanOldTasks", function () {
    async function insertTask(opts: { status: string; ageDays: number }): Promise<number> {
      const r = await handle.all<{ task_id: number }>(`
        INSERT INTO tasks(type, data, status, ctime)
        VALUES ('legacyTask', '{}'::jsonb, $1::task_status, now() - ($2::int || ' days')::interval)
        RETURNING task_id
      `, [opts.status, opts.ageDays]);
      return r[0].task_id;
    }

    it("deletes successful tasks older than task_retention_days", async function () {
      const oldOk = await insertTask({ status: "success", ageDays: 60 });
      const freshOk = await insertTask({ status: "success", ageDays: 5 });

      const result = await scheduler.run({ handler: cleanOldTasks, data: {} });
      expect(result).to.have.property("success").that.is.at.least(1);

      const remaining = await handle.all<{ task_id: number }>(`SELECT task_id FROM tasks WHERE task_id IN ($1, $2)`, [oldOk, freshOk]);
      const ids = remaining.map(r => r.task_id);
      expect(ids).to.not.include(oldOk);
      expect(ids).to.include(freshOk);
    });

    it("deletes errored tasks older than task_errors_retention_days", async function () {
      const oldErr = await insertTask({ status: "error", ageDays: 120 });
      const freshErr = await insertTask({ status: "error", ageDays: 30 });

      const result = await scheduler.run({ handler: cleanOldTasks, data: {} });
      expect(result).to.have.property("error").that.is.at.least(1);

      const remaining = await handle.all<{ task_id: number }>(`SELECT task_id FROM tasks WHERE task_id IN ($1, $2)`, [oldErr, freshErr]);
      const ids = remaining.map(r => r.task_id);
      expect(ids).to.not.include(oldErr);
      expect(ids).to.include(freshErr);
    });

    it("leaves running tasks alone even if old", async function () {
      const oldRunning = await insertTask({ status: "running", ageDays: 365 });

      await scheduler.run({ handler: cleanOldTasks, data: {} });

      const row = await handle.get<{ task_id: number }>(`SELECT task_id FROM tasks WHERE task_id = $1`, [oldRunning]);
      expect(row).to.exist;
    });

    it("cascades deletion to children", async function () {
      const parent = await insertTask({ status: "success", ageDays: 60 });
      const child = await handle.all<{ task_id: number }>(`
        INSERT INTO tasks(type, data, status, parent, ctime)
        VALUES ('child', '{}'::jsonb, 'success', $1, now())
        RETURNING task_id
      `, [parent]);
      const childId = child[0].task_id;

      await scheduler.run({ handler: cleanOldTasks, data: {} });

      const remaining = await handle.all(`SELECT task_id FROM tasks WHERE task_id IN ($1, $2)`, [parent, childId]);
      expect(remaining).to.have.length(0);
    });

    it("skips successful cleanup when task_retention_days is 0", async function () {
      await config.set("task_retention_days", 0);
      const oldOk = await insertTask({ status: "success", ageDays: 365 });

      const result = await scheduler.run({ handler: cleanOldTasks, data: {} });
      expect(result).to.deep.include({ success: 0 });

      const row = await handle.get(`SELECT task_id FROM tasks WHERE task_id = $1`, [oldOk]);
      expect(row).to.exist;
    });
  });

  describe("cleanLooseObjects", function () {
    let scene_id: number;
    this.beforeEach(async function () {
      scene_id = await vfs.createScene("loose-" + Date.now());
    });

    it("removes old dangling blobs", async function () {
      const file = await vfs.writeFile(dataStream(["Hello World\n"]), { scene: scene_id, name: "foo.txt", mime: "text/plain", user_id: null });
      // Backdate mtime so the safety window passes
      await fs.utimes(vfs.filepath(file), new Date(Date.now() - 3600 * 1000 * 2), new Date(Date.now() - 3600 * 1000 * 3));
      await vfs.removeScene(scene_id);
      await expect(fs.access(vfs.filepath(file as any), constants.R_OK)).to.be.fulfilled;

      const report = await scheduler.run({ handler: cleanLooseObjects, data: {} });
      expect(report).to.equal("Cleaned 1 loose object");
      await expect(fs.access(vfs.filepath(file as any), constants.R_OK)).to.be.rejectedWith("ENOENT");
    });
  });

  describe("checkForMissingObjects", function () {
    let scene_id: number;
    this.beforeEach(async function () {
      scene_id = await vfs.createScene("missing-" + Date.now());
    });

    it("reports missing blobs", async function () {
      const file = await vfs.writeFile(dataStream(["Hello World\n"]), { scene: scene_id, name: "foo.txt", mime: "text/plain", user_id: null });
      await fs.rm(vfs.getPath(file as any), { force: false });

      const report = await scheduler.run({ handler: checkForMissingObjects, data: {} });
      expect(report).to.equal("File 0qhPS4tlCTfsj3PNi-LHSt1akRumTfJ0WO2CKdqASiY can't be read on disk (can't fix). Some data have been lost!");
    });
  });

  describe("cleanTaskArtifacts", function () {
    it("returns undefined when artifactsDir is empty", async function () {
      const report = await scheduler.run({ handler: cleanTaskArtifacts, data: {} });
      expect(report).to.be.undefined;
    });

    it("removes directories for tasks that no longer exist", async function () {
      const rows = await handle.all<{ task_id: number }>(`INSERT INTO tasks(type, status) VALUES ('test', 'running') RETURNING task_id`);
      const task_id = rows[0].task_id;
      const dir = await vfs.createTaskWorkspace(task_id);
      await expect(fs.access(dir)).to.be.fulfilled;

      await handle.run(`DELETE FROM tasks WHERE task_id = $1`, [task_id]);
      const report = await scheduler.run({ handler: cleanTaskArtifacts, data: {} });
      expect(report).to.equal("Cleaned 1 stale artifact directory");
      await expect(fs.access(dir)).to.be.rejectedWith("ENOENT");
    });

    it("keeps directories for tasks that still exist", async function () {
      const rows = await handle.all<{ task_id: number }>(`INSERT INTO tasks(type, status) VALUES ('test', 'running') RETURNING task_id`);
      const task_id = rows[0].task_id;
      const dir = await vfs.createTaskWorkspace(task_id);

      const report = await scheduler.run({ handler: cleanTaskArtifacts, data: {} });
      expect(report).to.be.undefined;
      await expect(fs.access(dir)).to.be.fulfilled;
    });

    it("ignores non-numeric entries in artifactsDir", async function () {
      await fs.mkdir(path.join(vfs.artifactsDir, "not-a-task-id"), { recursive: true });

      const report = await scheduler.run({ handler: cleanTaskArtifacts, data: {} });
      expect(report).to.be.undefined;
      await expect(fs.access(path.join(vfs.artifactsDir, "not-a-task-id"))).to.be.fulfilled;
    });
  });

  describe("optimize", function () {
    it("returns a non-empty message", async function () {
      const out = await scheduler.run({ handler: optimize, data: {} });
      expect(out).to.be.a("string").and.have.length.greaterThan(0);
    });
  });

  describe("runCleanup", function () {
    const expectedPhases = ["cleanLooseObjects", "checkForMissingObjects", "cleanTaskArtifacts", "cleanOldTasks", "optimize"];

    async function expectAllPhasesSucceed() {
      const tree = await handle.all<{ type: string; status: string }>(`
        SELECT type, status FROM tasks WHERE type = ANY($1::text[])
      `, [expectedPhases]);
      expect(tree.map(r => r.type).sort()).to.deep.equal([...expectedPhases].sort());
      for (const row of tree) {
        expect(row.status, `phase ${row.type} should succeed`).to.equal("success");
      }
    }

    it("runs all phases as child tasks on startup", async function () {
      await scheduler.run({ handler: runCleanup, data: { trigger: "startup" } });
      await expectAllPhasesSucceed();
    });

    it("runs all phases as child tasks on scheduled trigger", async function () {
      await scheduler.run({ handler: runCleanup, data: { trigger: "scheduled" } });
      await expectAllPhasesSucceed();
    });

    it("defaults trigger to scheduled when omitted", async function () {
      await scheduler.run({ handler: runCleanup, data: {} });
      await expectAllPhasesSucceed();
    });
  });

  describe("reapOrphans", function () {
    it("marks pending/running/initializing tasks as error", async function () {
      const ids: Record<string, number> = {};
      for (const status of ["pending", "running", "initializing"]) {
        const r = await handle.all<{ task_id: number }>(`
          INSERT INTO tasks(type, data, status) VALUES ('orphan', '{}'::jsonb, $1::task_status) RETURNING task_id
        `, [status]);
        ids[status] = r[0].task_id;
      }
      const reaped = await scheduler.reapOrphans();
      expect(reaped).to.equal(3);

      for (const status of Object.keys(ids)) {
        const row = await handle.get<{ status: string; output: any }>(`SELECT status, output FROM tasks WHERE task_id = $1`, [ids[status]]);
        expect(row?.status).to.equal("error");
        expect(row?.output).to.have.nested.property("error.name", "OrphanError");
      }
    });

    it("leaves terminal tasks untouched", async function () {
      const ok = await handle.all<{ task_id: number }>(`
        INSERT INTO tasks(type, data, status) VALUES ('done', '{}'::jsonb, 'success') RETURNING task_id
      `);
      const err = await handle.all<{ task_id: number }>(`
        INSERT INTO tasks(type, data, status, output) VALUES ('failed', '{}'::jsonb, 'error', '{"error":{"name":"X","message":"y"}}'::json) RETURNING task_id
      `);

      await scheduler.reapOrphans();

      const okRow = await handle.get<{ status: string }>(`SELECT status FROM tasks WHERE task_id = $1`, [ok[0].task_id]);
      const errRow = await handle.get<{ status: string; output: any }>(`SELECT status, output FROM tasks WHERE task_id = $1`, [err[0].task_id]);
      expect(okRow?.status).to.equal("success");
      expect(errRow?.status).to.equal("error");
      expect(errRow?.output).to.have.nested.property("error.name", "X");
    });
  });
});
