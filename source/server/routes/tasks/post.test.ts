import request from "supertest";
import { randomBytes } from "node:crypto";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";


describe("POST /tasks", function(){
  let userManager :UserManager, taskScheduler :TaskScheduler;
  let user :User, admin :User, other :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    user = await userManager.addUser("bob", "12345678", "create");
    admin = await userManager.addUser("alice", "12345678", "admin");
    other = await userManager.addUser("charlie", "12345678", "create");
  });

  it("creates an upload task", async function(){
    const {body} = await request(this.server).post("/tasks")
    .set("Authorization", await bearer("bob"))
    .send({type: "parseUserUpload", status: "initializing", data: {filename: "foo.glb", size: 1}})
    .expect(201);
    expect(body).to.have.property("task_id").a("number");
    expect(body).to.have.property("status", "initializing");
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

  describe("delayTask", function(){
    it("waits, then succeeds", async function(){
      const {body} = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "delayTask", data: {ms: 20}})
      .expect(201);
      expect(body).to.have.property("status", "success");
      expect(body).to.have.property("output").deep.equal({ms: 20});
      expect(await taskScheduler.getLogs(body.task_id)).to.have.length.above(0);
    });

    it("defaults to no delay", async function(){
      const {body} = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "delayTask"})
      .expect(201);
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
      .expect(201);
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
});
