import request from "supertest";
import { once } from "node:events";
import { randomBytes, randomInt } from "node:crypto";
import { rm } from "node:fs/promises";
import yauzl, { Entry, ZipFile } from "yauzl";
import { buffer as readStream } from "node:stream/consumers";

import UserManager from "../../../../auth/UserManager.js";
import Vfs from "../../../../vfs/index.js";
import { TaskScheduler } from "../../../../tasks/scheduler.js";
import User from "../../../../auth/User.js";


async function getZipEntries(buf: Buffer): Promise<Entry[]> {
  const zip = await new Promise<ZipFile>((resolve, reject) =>
    yauzl.fromBuffer(buf, (err, zip) => (err ? reject(err) : resolve(zip)))
  );
  const entries: Entry[] = [];
  zip.on("entry", (e) => entries.push(e));
  await once(zip, "end");
  return entries;
}

async function readZipEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) =>
    zip.openReadStream(entry, (err, s) => (err ? reject(err) : resolve(s)))
  );
  return readStream(stream);
}


describe("GET /tasks/:id/artifact", function () {
  let vfs: Vfs, userManager: UserManager, taskScheduler: TaskScheduler;
  let bob: User;

  this.beforeAll(async function () {
    const locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    bob = await userManager.addUser("bob", "12345678");
    await userManager.addUser("alice", "12345678", "admin");
    await userManager.addUser("charlie", "12345678");
  });

  this.afterAll(async function () {
    await cleanIntegrationContext(this);
  });


  describe("access tests", function () {
    let task_id:number;
    this.beforeAll(async function () {
      task_id = await taskScheduler.run({
        user_id: bob.uid,
        data: {},
        type: "dummyTask",
        handler: async ({task: {task_id}})=>{
          //Do nothing
          return task_id;
        }
      });
    });

    it("requires authentication", async function () {
      await request(this.server).get(`/tasks/${task_id}/artifact`).expect(401);
    });

    it("returns 401 when task belongs to another user", async function () {
      await request(this.server)
        .get(`/tasks/${task_id}/artifact`)
        .auth("charlie", "12345678")
        .expect(401);
    });

    it("returns 405 when task is not yet successful", async function () {
      let task = await taskScheduler.create({user_id: bob.uid, data: {}, status: "initializing", type: "initTask"});
      await request(this.server)
        .get(`/tasks/${task.task_id}/artifact`)
        .auth("bob", "12345678")
        .expect(405);
    });

    it("returns 200 with an empty files array (json)", async function () {
      const { body } = await request(this.server)
        .get(`/tasks/${task_id}/artifact`)
        .auth("bob", "12345678")
        .accept("application/json")
        .expect(200);
      expect(body).to.have.property("files").that.is.an("array").with.lengthOf(0);
    });

    it("returns 200 with an empty zip", async function () {
      const res = await request(this.server)
        .get(`/tasks/${task_id}/artifact`)
        .auth("bob", "12345678")
        .accept("application/zip")
        .expect(200);
      const entries = await getZipEntries(Buffer.from(res.text, "binary"));
      expect(entries).to.have.length(0);
    });
  });

  describe("upload tasks", function () {
    let filename: string, size: number, task: number;
    this.beforeEach(async function () {
      filename = randomBytes(4).toString("hex") + ".bin";
      size = randomInt(16, 512);
      const { body } = await request(this.server)
        .post("/tasks")
        .auth("bob", "12345678")
        .set("Content-Type", "application/json")
        .send({ type: "parseUserUpload", data: { filename, size }, status: "initializing" })
        .expect(201);
      task = body.task_id;
    });
    let data: Buffer;

    this.beforeEach(async function () {
      data = randomBytes(size);
      await request(this.server)
        .put(`/tasks/${task}/artifact`)
        .auth("bob", "12345678")
        .send(data)
        .expect(201);
    });

    function getArtifact(server: any) {
      return request(server)
        .get(`/tasks/${task}/artifact`)
        .auth("bob", "12345678")
        .accept("application/zip")
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(chunks as any)));
        });
    }

    it("returns 200 with Content-Type application/zip", async function () {
      await request(this.server)
        .get(`/tasks/${task}/artifact`)
        .auth("bob", "12345678")
        .expect(200)
        .expect("Content-Type", /application\/zip/);
    });

    it("rejects Not Acceptable content types", async function(){
        await request(this.server)
        .get(`/tasks/${task}/artifact`)
        .auth("bob", "12345678")
        .accept("text/plain")
        .expect(406); //Not Acceptable
    });

    it("sets Content-Disposition to an attachment with the task id in the filename", async function () {
      const res = await getArtifact(this.server).expect(200);
      expect(res.headers["content-disposition"]).to.match(/attachment/);
      expect(res.headers["content-disposition"]).to.include(`task-${task}.zip`);
    });

    it("returns a zip containing the uploaded file", async function () {
      const res = await getArtifact(this.server).expect(200);
      const entries = await getZipEntries(res.body as Buffer);
      expect(entries.map((e) => e.fileName)).to.include(filename);
    });

    it("zip entry content matches the uploaded data", async function () {
      const res = await getArtifact(this.server).expect(200);
      const zip = await new Promise<ZipFile>((resolve, reject) =>
        yauzl.fromBuffer(res.body as Buffer, (err, zip) => (err ? reject(err) : resolve(zip)))
      );
      const entries: Entry[] = [];
      zip.on("entry", (e) => entries.push(e));
      await once(zip, "end");

      const target = entries.find((e) => e.fileName === filename);
      expect(target, `entry "${filename}" not found in zip`).to.exist;
      const content = await readZipEntry(zip, target!);
      expect(content.toString("hex")).to.equal(data.toString("hex"));
    });

    describe("when Accept: application/json", function () {
      function getArtifactJson(server: any) {
        return request(server)
          .get(`/tasks/${task}/artifact`)
          .auth("bob", "12345678")
          .accept("application/json");
      }

      it("returns 200 with Content-Type application/json", async function () {
        await getArtifactJson(this.server)
          .expect(200)
          .expect("Content-Type", /application\/json/);
      });

      it("returns an object with a files array", async function () {
        const { body } = await getArtifactJson(this.server).expect(200);
        expect(body).to.have.property("files").that.is.an("array");
      });

      it("files array contains an entry for the uploaded file", async function () {
        const { body } = await getArtifactJson(this.server).expect(200);
        const entry = (body.files as any[]).find((f) => f.path === filename);
        expect(entry, `entry "${filename}" not found in files list`).to.exist;
      });

      it("each file entry has path, size, ctime and mtime", async function () {
        const { body } = await getArtifactJson(this.server).expect(200);
        const entry = (body.files as any[]).find((f) => f.path === filename);
        expect(entry).to.have.property("path", filename);
        expect(entry).to.have.property("size", size);
        expect(entry).to.have.property("ctime").that.is.a("string");
        expect(entry).to.have.property("mtime").that.is.a("string");
      });
    });
  });

});
