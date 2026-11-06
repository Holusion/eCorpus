import request from "supertest";

import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";


describe("Lists of tasks in the UI", function(){
  let userManager: UserManager, taskScheduler: TaskScheduler;
  let owner: number, other: number;

  /** Requests a page, by default as the owner of the tasks */
  async function page(server: any, path: string, {status = 200, as = "owner" as string|null} = {}){
    const req = request(server).get(path);
    if(as) req.set("Authorization", await bearer(as));
    return await req.expect(status);
  }

  async function task({user_id = owner as number|null} = {}){
    const {task_id} = await taskScheduler.create({type: "testTask", data: {}, user_id, status: "success"});
    return task_id;
  }
  const link = (task_id: number)=> `href="/ui/tasks/${task_id}"`;

  this.beforeAll(async function(){
    const locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
  });

  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    owner = (await userManager.addUser("owner", "12345678", "create", "owner@example.com")).uid;
    other = (await userManager.addUser("other", "12345678", "create")).uid;
    await userManager.addUser("admin", "12345678", "admin");
  });

  describe("GET /ui/admin/tasks", function(){
    const url = "/ui/admin/tasks";

    it("shows everyone's tasks", async function(){
      const mine = await task();
      const theirs = await task({user_id: other});
      const nobody = await task({user_id: null});
      const {text} = await page(this.server, url, {as: "admin"});
      for(const id of [mine, theirs, nobody]) expect(text).to.include(link(id));
    });

    it("links the owner of a task to their tasks", async function(){
      await task();
      const {text} = await page(this.server, url, {as: "admin"});
      expect(text).to.include(`<a href="/ui/users/${owner}/tasks">owner</a>`);
    });

    it("is only for admins", async function(){
      await page(this.server, url, {as: "owner", status: 401});
    });
  });
});
