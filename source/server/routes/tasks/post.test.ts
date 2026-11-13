import request from "supertest";
import { randomBytes } from "node:crypto";
import timers from "node:timers/promises";
import { Client } from "pg";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import { TaskDefinition } from "../../tasks/types.js";
import Vfs from "../../vfs/index.js";
import { Document, NodeIO } from "@gltf-transform/core";


describe("POST /tasks", function(){
  let userManager :UserManager, taskScheduler :TaskScheduler, vfs :Vfs;
  let user :User, admin :User, other :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    vfs = locals.vfs;
    user = await userManager.addUser("bob", "12345678", "create");
    admin = await userManager.addUser("alice", "12345678", "admin");
    other = await userManager.addUser("charlie", "12345678", "create");
  });

  describe("initial status", function(){
    it("creates an upload task waiting for its data", async function(){
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "parseUserUpload", data: {filename: "foo.glb", size: 1}})
      .expect(201);
      expect(res.body).to.have.property("task_id").a("number");
      expect(res.body).to.have.property("status", "initializing");
      expect(res.headers).to.have.property("location", `/tasks/${res.body.task_id}`);
    });

    it("accepts a status matching the type's", async function(){
      const {body} = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "parseUserUpload", status: "initializing", data: {filename: "foo.glb", size: 1}})
      .expect(201);
      expect(body).to.have.property("status", "initializing");
      await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "delayTask", status: "pending", data: {}})
      .expect(200);
    });

    for(const [type, status] of [["delayTask", "initializing"], ["parseUserUpload", "pending"], ["delayTask", "running"], ["delayTask", "success"]]){
      it(`rejects ${type} created ${status}`, async function(){
        const count = async ()=> (await taskScheduler.getTasks({type, user_id: user.uid, limit: 100})).length;
        const before = await count();
        await request(this.server).post("/tasks")
        .set("Authorization", await bearer("bob"))
        .send({type, status, data: {filename: "foo.glb", size: 1}})
        .expect(400);
        expect(await count()).to.equal(before);
      });
    }
  });

  describe("rejects internal task types", function(){
    for(const type of ["sendEmail", "cleanOldTasks", "runCleanup", "optimize"]){
      for(const username of ["bob", "alice"]){
        it(`${type} (as ${username})`, async function(){
          await request(this.server).post("/tasks")
          .set("Authorization", await bearer(username))
          .send({type, data: {to: "victim@example.com", subject: "hi", html: "hi"}})
          .expect(400);
          expect(await taskScheduler.getTasks({type})).to.deep.equal([]);
        });
      }
    }
  });

  describe("rejects inherited properties", function(){
    for(const type of ["constructor", "toString", "__proto__", "hasOwnProperty"]){
      it(type, async function(){
        await request(this.server).post("/tasks")
        .set("Authorization", await bearer("bob"))
        .send({type, data: {}})
        .expect(400);
      });
    }
  });

  /** Poll a task until it reaches a final status */
  async function settled(task_id: number, timeout = 2000): Promise<TaskDefinition>{
    const end = Date.now() + timeout;
    while(true){
      const task = await taskScheduler.getTask(task_id);
      if(task.status === "success" || task.status === "error") return task;
      if(end < Date.now()) throw new Error(`Task #${task_id} still ${task.status} after ${timeout}ms`);
      await timers.setTimeout(10);
    }
  }

  async function notificationsOf(task_id: number){
    return await taskScheduler.db.all(`SELECT fk_user_id AS user_id, type, read FROM notifications WHERE fk_task_id = $1`, [task_id]);
  }

  describe("delayTask", function(){
    it("waits, then succeeds", async function(){
      const {body} = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "delayTask", data: {ms: 20}})
      .expect(200)
      .expect("Content-Location", /^\/tasks\/\d+$/);
      expect(body).to.have.property("status", "success");
      expect(body).to.have.property("output").deep.equal({ms: 20});
      expect(await taskScheduler.getLogs(body.task_id)).to.have.length.above(0);
    });

    it("defaults to no delay", async function(){
      const {body} = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "delayTask"})
      .expect(200);
      expect(body).to.have.property("output").deep.equal({ms: 0});
    });

    it("fails on demand", async function(){
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "delayTask", data: {ms: 0, fail: "Requested failure"}})
      .expect(500);
      expect(res.body.message).to.match(/Requested failure/);
      const [task] = await taskScheduler.getTasks({type: "delayTask", user_id: user.uid, status: "error"});
      expect(task).to.be.ok;
    });

    for(const ms of [-1, 1.5, "10", 10*60*1000 + 1]){
      it(`rejects ms = ${JSON.stringify(ms)}`, async function(){
        await request(this.server).post("/tasks")
        .set("Authorization", await bearer("bob"))
        .send({type: "delayTask", data: {ms}})
        .expect(400);
      });
    }
  });

  describe("Prefer: respond-async", function(){
    let listener: Client;
    let signals: any[];
    this.beforeEach(async function(){
      signals = [];
      listener = new Client({connectionString: this.db_uri});
      await listener.connect();
      listener.on("notification", (msg)=> signals.push(JSON.parse(msg.payload!)));
      await listener.query("LISTEN notifications");
    });
    this.afterEach(async function(){
      await listener.end();
    });

    /** Wait for `count` signals about the notification of `task_id` */
    async function signalsOf(task_id: number, count: number, timeout = 1000){
      const about = ()=> signals.filter(s => s.item.task_id === task_id);
      const end = Date.now() + timeout;
      while(about().length < count && Date.now() < end){
        await timers.setTimeout(10);
      }
      return about().map(({user_id, item: {status, read}})=>({user_id, status, read}));
    }

    it("answers 202 at once, then notifies the requester", async function(){
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .set("Prefer", "respond-async")
      .send({type: "delayTask", data: {ms: 100}})
      .expect(202);
      const task_id = res.body.task_id;
      expect(task_id).to.be.a("number");
      expect(res.body.status).to.be.oneOf(["pending", "running"]);
      expect(res.headers).to.have.property("location", `/tasks/${task_id}`);
      expect(res.headers).to.have.property("preference-applied", "respond-async");
      expect(await notificationsOf(task_id)).to.deep.equal([{user_id: user.uid, type: "delayTask", read: false}]);

      expect(await settled(task_id)).to.have.property("status", "success");
      const received = await signalsOf(task_id, 3);
      expect(received[0]).to.deep.equal({user_id: user.uid, status: "pending", read: false});
      expect(received.at(-1)).to.deep.equal({user_id: user.uid, status: "success", read: false});
    });

    it("notifies about a failure", async function(){
      const {body: {task_id}} = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .set("Prefer", "wait=10, respond-async")
      .send({type: "delayTask", data: {ms: 10, fail: "Requested failure"}})
      .expect(202);
      expect(await settled(task_id)).to.have.property("status", "error");
      expect((await signalsOf(task_id, 3)).at(-1)).to.deep.equal({user_id: user.uid, status: "error", read: false});
      expect(await notificationsOf(task_id)).to.deep.equal([{user_id: user.uid, type: "delayTask", read: false}]);
    });

    it("is silent without the preference", async function(){
      const {body: {task_id}} = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "delayTask", data: {ms: 10}})
      .expect(200);
      expect(await notificationsOf(task_id)).to.deep.equal([]);
      expect(await signalsOf(task_id, 1, 100)).to.deep.equal([]);
    });

    it("is ignored for an initializing task", async function(){
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .set("Prefer", "respond-async")
      .send({type: "parseUserUpload", status: "initializing", data: {filename: "foo.glb", size: 1}})
      .expect(201);
      expect(res.headers).not.to.have.property("preference-applied");
      expect(await notificationsOf(res.body.task_id)).to.deep.equal([]);
    });

    it("still answers validation errors synchronously", async function(){
      await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .set("Prefer", "respond-async")
      .send({type: "sendEmail", data: {}})
      .expect(400);
    });
  });

  describe("source tasks", function(){
    /** Upload a file as `username`, returning the id of the (successful) upload task */
    async function upload(ctx: Mocha.Context, username: string): Promise<number>{
      const data = randomBytes(16);
      const {body: {task_id}} = await request(ctx.server).post("/tasks")
      .set("Authorization", await bearer(username))
      .send({type: "parseUserUpload", status: "initializing", data: {filename: "foo.bin", size: data.length}})
      .expect(201);
      await request(ctx.server).put(`/tasks/${task_id}/artifact`)
      .set("Authorization", await bearer(username))
      .send(data)
      .expect(201);
      expect(await taskScheduler.getTask(task_id)).to.have.property("status", "success");
      return task_id;
    }

    let own: number, foreign: number;
    this.beforeEach(async function(){
      own = await upload(this, "charlie");
      foreign = await upload(this, "bob");
    });

    async function sceneExists(ctx: Mocha.Context, name: string){
      const res = await request(ctx.server).get(`/scenes/${name}`)
      .set("Authorization", await bearer("alice"));
      return res.status !== 404;
    }

    it("createSceneFromFiles uses the requester's uploads", async function(){
      const name = randomBytes(4).toString("hex");
      await request(this.server).post("/tasks")
      .set("Authorization", await bearer("charlie"))
      .send({type: "createSceneFromFiles", data: {tasks: [own], name, language: "EN"}})
      .expect(200);
      expect(await sceneExists(this, name)).to.be.true;
    });

    for(const sources of [["foreign"], ["own", "foreign"]]){
      it(`createSceneFromFiles rejects other users' uploads (${sources.join(", ")})`, async function(){
        const name = randomBytes(4).toString("hex");
        const ids = sources.map(s=> s === "own"? own: foreign);
        await request(this.server).post("/tasks")
        .set("Authorization", await bearer("charlie"))
        .send({type: "createSceneFromFiles", data: {tasks: ids, name, language: "EN"}})
        .expect(401);
        expect(await sceneExists(this, name)).to.be.false;
      });
    }

    it("createSceneFromFiles rejects other users' uploads, even for admins", async function(){
      const name = randomBytes(4).toString("hex");
      await request(this.server).post("/tasks")
      .set("Authorization", await bearer("alice"))
      .send({type: "createSceneFromFiles", data: {tasks: [foreign], name, language: "EN"}})
      .expect(401);
      expect(await sceneExists(this, name)).to.be.false;
    });

    it("extractScenesArchives rejects other users' uploads", async function(){
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("charlie"))
      .send({type: "extractScenesArchives", data: {tasks: [foreign]}})
      .expect(401);
      expect(res.body.message).not.to.match(/zip/);
    });

    it("extractScenesArchives checks the requester's own uploads further", async function(){
      //Not an archive: it gets past the ownership check
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("charlie"))
      .send({type: "extractScenesArchives", data: {tasks: [own]}})
      .expect(400);
      expect(res.body.message).to.match(/did not output a zip file/);
    });

    it("rejects missing source ids", async function(){
      for(const type of ["createSceneFromFiles", "extractScenesArchives"]){
        await request(this.server).post("/tasks")
        .set("Authorization", await bearer("charlie"))
        .send({type, data: {name: "foo", language: "EN"}})
        .expect(400);
      }
    });
  });

  /** What users get to read of how it went: in their language, when it fails and when it's told later from the task */
  describe("localized outcomes", function(){
    /** Uploads a file as charlie, returning the id of the upload task */
    async function upload(ctx: Mocha.Context, filename: string, data: Buffer): Promise<number>{
      const {body: {task_id}} = await request(ctx.server).post("/tasks")
      .set("Authorization", await bearer("charlie"))
      .send({type: "parseUserUpload", data: {filename, size: data.length}})
      .expect(201);
      await request(ctx.server).put(`/tasks/${task_id}/artifact`)
      .set("Authorization", await bearer("charlie"))
      .send(data)
      .expect(201);
      return task_id;
    }

    /** The latest createSceneFromFiles of charlie's, as it's sent to them */
    async function latest(ctx: Mocha.Context, lng: string){
      const {task_id} = (await taskScheduler.db.get<{task_id: number}>(`
        SELECT task_id FROM tasks WHERE type = 'createSceneFromFiles' AND fk_user_id = $1 ORDER BY task_id DESC LIMIT 1
      `, [other.uid]))!;
      const {body} = await request(ctx.server).get(`/tasks/${task_id}`)
      .set("Authorization", await bearer("charlie"))
      .set("Accept-Language", lng)
      .expect(200);
      return body.task as TaskDefinition;
    }

    it("tells that a scene's name is taken", async function(){
      const name = randomBytes(4).toString("hex");
      await vfs.createScene(name, admin.uid);
      const source = await upload(this, "foo.bin", randomBytes(16));
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("charlie"))
      .set("Accept-Language", "fr")
      .send({type: "createSceneFromFiles", data: {tasks: [source], name, language: "EN"}})
      .expect(409);
      //Only the message, without its code: that's for those who know it
      expect(res.body).to.deep.equal({code: 409, message: `Error: Une scène nommée ${name} existe déjà`});
      expect((await latest(this, "fr")).output).to.have.property("message", `Une scène nommée ${name} existe déjà`);
      expect((await latest(this, "en")).output).to.have.property("message", `A scene named ${name} already exists`);
    });

    it("tells that a model couldn't be optimized", async function(){
      //A model without a scene: there's nothing to optimize
      const glb = Buffer.from(await new NodeIO().writeBinary(new Document()));
      const source = await upload(this, "empty.glb", glb);
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("charlie"))
      .set("Accept-Language", "fr")
      .send({type: "createSceneFromFiles", data: {tasks: [source], name: randomBytes(4).toString("hex"), language: "EN", options: {optimize: true}}})
      .expect(500);
      expect(res.body).to.deep.equal({code: 500, message: `Error: empty.glb n'a pas pu être optimisé : Empty glb (no root scene)`});
      expect((await latest(this, "fr")).output).to.have.property("message", `empty.glb n'a pas pu être optimisé : Empty glb (no root scene)`);
    });
  });
});
