import request from "supertest";

import User from "../../../../auth/User.js";
import UserManager from "../../../../auth/UserManager.js";
import Vfs from "../../../../vfs/index.js";
import { TaskScheduler } from "../../../../tasks/scheduler.js";


describe("GET /tasks/:id/tree", function(){
  let vfs :Vfs, userManager :UserManager, taskScheduler :TaskScheduler;
  let user :User, admin :User, other :User;

  this.beforeAll(async function(){
    let locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    user = await userManager.addUser("bob", "12345678");
    admin = await userManager.addUser("alice", "12345678", "admin");
    other = await userManager.addUser("charlie", "12345678");
  });

  this.afterAll(async function(){
    await cleanIntegrationContext(this);
  });

  it("requires authentication", async function(){
    const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
    await request(this.server).get(`/tasks/${task.task_id}/tree`)
    .expect(401);
  });

  it("returns task tree with logs", async function(){
    const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
    const {body} = await request(this.server).get(`/tasks/${task.task_id}/tree`)
    .auth("bob", "12345678")
    .expect(200);
    expect(body).to.have.property("task");
    expect(body).to.have.property("logs").to.be.an("array");
    expect(body.task).to.have.property("task_id", task.task_id);
    expect(body.task).to.have.property("children").to.be.an("array");
  });

  it("returns 404 for non-existent task", async function(){
    await request(this.server).get(`/tasks/999999/tree`)
    .auth("bob", "12345678")
    .expect(404);
  });

  describe("permissions", function(){

    it("task owner can access their own task", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
      await request(this.server).get(`/tasks/${task.task_id}/tree`)
      .auth("bob", "12345678")
      .expect(200);
    });

    it("admin can access any task", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
      await request(this.server).get(`/tasks/${task.task_id}/tree`)
      .auth("alice", "12345678")
      .expect(200);
    });

    it("unrelated user cannot access another user's task", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
      await request(this.server).get(`/tasks/${task.task_id}/tree`)
      .auth("charlie", "12345678")
      .expect(401);
    });

    describe("scene-based access", function(){
      let scene_id :number;

      this.beforeAll(async function(){
        scene_id = await vfs.createScene("task-tree-test");
        // Make the scene private so default access doesn't grant read
        await request(this.server).patch(`/scenes/task-tree-test`)
        .auth("alice", "12345678")
        .send({default_access: "none", public_access: "none"})
        .expect(200);
      });

      it("user with read access to the scene can access the task tree", async function(){
        await userManager.grant(scene_id, other.uid, "read");
        const task = await taskScheduler.create({scene_id, user_id: null, type: "test", data: {}});
        await request(this.server).get(`/tasks/${task.task_id}/tree`)
        .auth("charlie", "12345678")
        .expect(200);
      });

      it("user without scene access cannot access the task tree", async function(){
        await userManager.grant(scene_id, other.uid, "none");
        const task = await taskScheduler.create({scene_id, user_id: null, type: "test", data: {}});
        const res = await request(this.server).get(`/tasks/${task.task_id}/tree`)
        .auth("charlie", "12345678");
        // Access denial may be obfuscated as 404
        expect(res.status).to.be.oneOf([401, 404]);
      });
    });

    it("rejects user for a task with no owner and no scene", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: null, type: "test", data: {}});
      await request(this.server).get(`/tasks/${task.task_id}/tree`)
      .auth("bob", "12345678")
      .expect(401);
    });

    it("admin can access a task with no owner and no scene", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: null, type: "test", data: {}});
      await request(this.server).get(`/tasks/${task.task_id}/tree`)
      .auth("alice", "12345678")
      .expect(200);
    });
  });
});
