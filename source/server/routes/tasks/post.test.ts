import request from "supertest";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";


describe("POST /tasks", function(){
  let userManager :UserManager, taskScheduler :TaskScheduler;
  let user :User, admin :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    user = await userManager.addUser("bob", "12345678", "create");
    admin = await userManager.addUser("alice", "12345678", "admin");
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
});
