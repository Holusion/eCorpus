import timers from "node:timers/promises";

import request from "supertest";

import { TaskScheduler } from "../../tasks/scheduler.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";


describe("GET /ui/tasks/:id", function(){
  let vfs: Vfs, userManager: UserManager, taskScheduler: TaskScheduler;
  let owner: number;
  const secret = "secret-task-data";

  this.beforeAll(async function(){
    const locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    owner = (await userManager.addUser("owner", "12345678", "create", "owner@example.com")).uid;
    await userManager.addUser("other", "12345678", "create");
    await userManager.addUser("admin", "12345678", "admin");
  });

  const createTask = (params: {user_id?: number|null, scene_id?: number|null} = {user_id: owner})=>
    taskScheduler.create({type: "testTask", status: "success", data: {secret}, ...params});

  describe("is refused", function(){
    it("to anonymous requests", async function(){
      const {task_id} = await createTask({user_id: owner});
      const {text} = await request(this.server).get(`/ui/tasks/${task_id}`).expect(401);
      expect(text).not.to.include(secret);
      expect(text).not.to.include("owner");
    });

    it("to anonymous requests, without telling which tasks exist", async function(){
      const {task_id} = await createTask({user_id: owner});
      await request(this.server).get(`/ui/tasks/${task_id}`).expect(401);
      await request(this.server).get(`/ui/tasks/99999999`).expect(401);
    });

    it("to other users", async function(){
      const {task_id} = await createTask({user_id: owner});
      const {text} = await request(this.server).get(`/ui/tasks/${task_id}`)
        .set("Authorization", await bearer("other"))
        .expect(401);
      expect(text).not.to.include(secret);
    });

    it("for a task nobody owns, except to admins", async function(){
      const {task_id} = await createTask({user_id: null});
      await request(this.server).get(`/ui/tasks/${task_id}`).expect(401);
      await request(this.server).get(`/ui/tasks/${task_id}`).set("Authorization", await bearer("other")).expect(401);
      await request(this.server).get(`/ui/tasks/${task_id}`).set("Authorization", await bearer("admin")).expect(200);
    });

    it("to a token without tasks:read", async function(){
      const {task_id} = await createTask({user_id: owner});
      await request(this.server).get(`/ui/tasks/${task_id}`)
        .set("Authorization", await bearer("owner", ["scenes:read"]))
        .expect(403);
    });

    it("for a task on a private scene the user has no access to", async function(){
      const scene_id = await vfs.createScene("private-scene", owner);
      await userManager.setPublicAccess(scene_id, "none");
      await userManager.setDefaultAccess(scene_id, "none");
      const {task_id} = await createTask({user_id: owner, scene_id});
      //Not a 401: scenes hide their existence from those who have no access to them
      const {text} = await request(this.server).get(`/ui/tasks/${task_id}`)
        .set("Authorization", await bearer("other"))
        .expect(404);
      expect(text).not.to.include(secret);
    });
  });

  describe("is shown", function(){
    it("to the task's owner", async function(){
      const {task_id} = await createTask({user_id: owner});
      const {text} = await request(this.server).get(`/ui/tasks/${task_id}`)
        .set("Authorization", await bearer("owner"))
        .expect(200);
      expect(text).to.include(secret);
    });

    it("to admins", async function(){
      const {task_id} = await createTask({user_id: owner});
      const {text} = await request(this.server).get(`/ui/tasks/${task_id}`)
        .set("Authorization", await bearer("admin"))
        .expect(200);
      expect(text).to.include(secret);
    });

    it("to a token with tasks:read", async function(){
      const {task_id} = await createTask({user_id: owner});
      await request(this.server).get(`/ui/tasks/${task_id}`)
        .set("Authorization", await bearer("owner", ["tasks:read"]))
        .expect(200);
    });

    it("to those who can read the task's scene, like GET /tasks/:id", async function(){
      const scene_id = await vfs.createScene("shared-scene", owner);
      await userManager.setPublicAccess(scene_id, "none");
      await userManager.setDefaultAccess(scene_id, "none");
      await userManager.grant(scene_id, "other", "read");
      const {task_id} = await createTask({user_id: owner, scene_id});
      await request(this.server).get(`/ui/tasks/${task_id}`).set("Authorization", await bearer("other")).expect(200);
      await request(this.server).get(`/tasks/${task_id}`).set("Authorization", await bearer("other")).expect(200);
    });
  });

  it("doesn't reveal the content of emails that anyone can trigger", async function(){
    await request(this.server).post(`/auth/login/owner/link`).expect(204);
    let task: {task_id: number}|undefined;
    for(let i = 0; !task && i < 100; i++){
      [task] = await taskScheduler.getTasks({type: "sendEmail", user_id: owner});
      if(!task) await timers.setTimeout(10);
    }
    expect(task, "the email task should exist").to.be.ok;
    const {text} = await request(this.server).get(`/ui/tasks/${task!.task_id}`).expect(401);
    expect(text).not.to.include("payload");
    expect(text).not.to.include("owner@example.com");
  });
});
