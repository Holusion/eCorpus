import request from "supertest";

import User from "../../../auth/User.js";
import UserManager from "../../../auth/UserManager.js";
import Vfs from "../../../vfs/index.js";
import { TaskScheduler } from "../../../tasks/scheduler.js";


describe("DELETE /tasks/:id", function(){
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


  it("requires authentication", async function(){
    const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
    await request(this.server).delete(`/tasks/${task.task_id}`)
    .expect(401);
  });

  it("deletes a task and returns 204", async function(){
    const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
    await request(this.server).delete(`/tasks/${task.task_id}`)
    .auth("bob", "12345678")
    .expect(204);

    // Verify the task is actually gone
    await request(this.server).get(`/tasks/${task.task_id}`)
    .auth("bob", "12345678")
    .expect(404);
  });

  it("returns 404 for non-existent task", async function(){
    await request(this.server).delete(`/tasks/999999`)
    .auth("bob", "12345678")
    .expect(404);
  });

  describe("permissions", function(){

    it("task owner can delete their own task", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
      await request(this.server).delete(`/tasks/${task.task_id}`)
      .auth("bob", "12345678")
      .expect(204);
    });

    it("admin can delete any task", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
      await request(this.server).delete(`/tasks/${task.task_id}`)
      .auth("alice", "12345678")
      .expect(204);
    });

    it("unrelated user cannot delete another user's task", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: user.uid, type: "test", data: {}});
      await request(this.server).delete(`/tasks/${task.task_id}`)
      .auth("charlie", "12345678")
      .expect(401);
    });

    describe("scene-based access", function(){
      let scene_id :number;

      this.beforeAll(async function(){
        scene_id = await vfs.createScene("task-delete-test");
        await request(this.server).patch(`/scenes/task-delete-test`)
        .auth("alice", "12345678")
        .send({default_access: "none", public_access: "none"})
        .expect(200);
      });

      it("user with admin access to the scene can delete the task", async function(){
        await userManager.grant(scene_id, other.uid, "admin");
        const task = await taskScheduler.create({scene_id, user_id: null, type: "test", data: {}});
        await request(this.server).delete(`/tasks/${task.task_id}`)
        .auth("charlie", "12345678")
        .expect(204);
      });

      it("user with only read access to the scene cannot delete the task", async function(){
        await userManager.grant(scene_id, other.uid, "read");
        const task = await taskScheduler.create({scene_id, user_id: null, type: "test", data: {}});
        const res = await request(this.server).delete(`/tasks/${task.task_id}`)
        .auth("charlie", "12345678");
        expect(res.status).to.be.oneOf([401, 404]);
      });

      it("user without scene access cannot delete the task", async function(){
        await userManager.grant(scene_id, other.uid, "none");
        const task = await taskScheduler.create({scene_id, user_id: null, type: "test", data: {}});
        const res = await request(this.server).delete(`/tasks/${task.task_id}`)
        .auth("charlie", "12345678");
        expect(res.status).to.be.oneOf([401, 404]);
      });
    });

    it("rejects user for a task with no owner and no scene", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: null, type: "test", data: {}});
      await request(this.server).delete(`/tasks/${task.task_id}`)
      .auth("bob", "12345678")
      .expect(401);
    });

    it("admin can delete a task with no owner and no scene", async function(){
      const task = await taskScheduler.create({scene_id: null, user_id: null, type: "test", data: {}});
      await request(this.server).delete(`/tasks/${task.task_id}`)
      .auth("alice", "12345678")
      .expect(204);
    });
  });
});
