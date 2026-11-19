import request from "supertest";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import Vfs from "../../vfs/index.js";


describe("POST /uploads", function(){
  let vfs :Vfs, userManager :UserManager, taskScheduler :TaskScheduler;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    await userManager.addUser("bob", "12345678", "create");
    await userManager.addUser("uma", "12345678", "use");
  });

  /** Number of upload tasks in the database */
  async function count(){
    return (await taskScheduler.getTasks({type: "parseUserUpload", limit: 100})).length;
  }

  it("creates an upload waiting for its data", async function(){
    const res = await request(this.server).post("/uploads")
    .set("Authorization", await bearer("bob"))
    .send({filename: "foo.glb", size: 1})
    .expect(201);
    expect(res.body).to.have.property("task_id").a("number");
    expect(res.body).to.have.property("type", "parseUserUpload");
    expect(res.body).to.have.property("status", "initializing");
    expect(res.body).to.have.property("data").deep.equal({filename: "foo.glb", size: 1});
    expect(res.headers).to.have.property("location", `/uploads/${res.body.task_id}`);
    //Its workspace is ready to receive data
    await expect(fs.stat(vfs.getTaskWorkspace(res.body.task_id))).to.be.fulfilled;
  });

  it("ignores Prefer: respond-async", async function(){
    const res = await request(this.server).post("/uploads")
    .set("Authorization", await bearer("bob"))
    .set("Prefer", "respond-async")
    .send({filename: "foo.glb", size: 1})
    .expect(201);
    expect(res.headers).not.to.have.property("preference-applied");
  });

  it("requires to be logged in", async function(){
    const before = await count();
    await request(this.server).post("/uploads")
    .send({filename: "foo.glb", size: 1})
    .expect(401);
    expect(await count()).to.equal(before);
  });

  it("requires the create level", async function(){
    const before = await count();
    await request(this.server).post("/uploads")
    .set("Authorization", await bearer("uma"))
    .send({filename: "foo.glb", size: 1})
    .expect(401);
    expect(await count()).to.equal(before);
  });

  describe("with a target scene", function(){
    let scene: string, scene_id: number;
    this.beforeEach(async function(){
      scene = randomBytes(4).toString("hex");
      const bob = await userManager.getUserByName("bob");
      scene_id = await vfs.createScene(scene, bob.uid);
    });

    it("attaches the upload to the scene", async function(){
      const {body} = await request(this.server).post("/uploads")
      .set("Authorization", await bearer("bob"))
      .send({filename: "foo.glb", size: 1, scene})
      .expect(201);
      expect(body).to.have.property("scene_id", scene_id);
      //Data and parameters are unchanged
      expect(body).to.have.property("data").deep.equal({filename: "foo.glb", size: 1});
    });

    it("requires write access to the scene", async function(){
      await userManager.addUser(`dave-${scene}`, "12345678", "create");
      await userManager.grant(scene, `dave-${scene}`, "read");
      const before = await count();
      await request(this.server).post("/uploads")
      .set("Authorization", await bearer(`dave-${scene}`))
      .send({filename: "foo.glb", size: 1, scene})
      .expect(401);
      expect(await count()).to.equal(before);
    });

    it("hides scenes the requester can't see", async function(){
      await userManager.addUser(`erin-${scene}`, "12345678", "create");
      await userManager.setPublicAccess(scene, "none");
      await userManager.setDefaultAccess(scene, "none");
      await request(this.server).post("/uploads")
      .set("Authorization", await bearer(`erin-${scene}`))
      .send({filename: "foo.glb", size: 1, scene})
      .expect(404);
    });

    it("rejects a missing scene", async function(){
      await request(this.server).post("/uploads")
      .set("Authorization", await bearer("bob"))
      .send({filename: "foo.glb", size: 1, scene: `missing-${scene}`})
      .expect(404);
    });

    it("rejects an invalid scene name", async function(){
      for(const name of ["", 12, {}]){
        await request(this.server).post("/uploads")
        .set("Authorization", await bearer("bob"))
        .send({filename: "foo.glb", size: 1, scene: name})
        .expect(400);
      }
    });
  });

  describe("rejects invalid data", function(){
    const cases: Array<[string, any]> = [
      ["no body", undefined],
      ["no filename", {size: 1}],
      ["empty filename", {filename: "", size: 1}],
      ["non-string filename", {filename: 12, size: 1}],
      ["no size", {filename: "foo.glb"}],
      ["string size", {filename: "foo.glb", size: "1"}],
      ["zero size", {filename: "foo.glb", size: 0}],
      ["negative size", {filename: "foo.glb", size: -1}],
      ["fractional size", {filename: "foo.glb", size: 1.5}],
    ];
    for(const [name, body] of cases){
      it(name, async function(){
        const before = await count();
        await request(this.server).post("/uploads")
        .set("Authorization", await bearer("bob"))
        .send(body)
        .expect(400);
        expect(await count()).to.equal(before);
      });
    }
  });

  describe("rejects file names that break out of the upload's workspace", function(){
    for(const name of ["../escape.bin", "../../../escape.bin", "foo/../../escape.bin", "/tmp/escape.bin"]){
      it(JSON.stringify(name), async function(){
        const before = await count();
        await request(this.server).post("/uploads")
        .set("Authorization", await bearer("bob"))
        .send({filename: name, size: 16})
        .expect(400);
        expect(await count()).to.equal(before);
        await expect(fs.access(path.resolve(vfs.artifactsDir, name))).to.be.rejectedWith("ENOENT");
      });
    }
  });
});
