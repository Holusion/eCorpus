import request from "supertest";

import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import { Config } from "../../utils/config.js";


describe("Notifications in the UI", function(){
  let userManager: UserManager, taskScheduler: TaskScheduler, config: Config;
  let owner: number, other: number, lowest: number;

  /** Requests a page, by default as the user who's getting notified */
  async function page(server: any, path: string, {status = 200, as = "owner" as string|null} = {}){
    const req = request(server).get(path);
    if(as) req.set("Authorization", await bearer(as));
    return await req.expect(status);
  }

  /** @returns the ID of the notification */
  async function notify({user_id = owner, fail = false} = {}){
    const task = await taskScheduler.create({type: "testTask", data: {}, user_id, notify: true, status: "running"});
    if(fail) await taskScheduler.errorTask(task.task_id, new Error("Task failed"));
    else await taskScheduler.releaseTask(task.task_id);
    const [notification] = await userManager.getNotifications(user_id, {limit: 1});
    return notification.notification_id;
  }

  this.beforeAll(async function(){
    const locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    config = locals.config;
  });

  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    await config.set("enable_events", true);
    owner = (await userManager.addUser("owner", "12345678", "create")).uid;
    other = (await userManager.addUser("other", "12345678", "create")).uid;
    lowest = (await userManager.addUser("lowest", "12345678", "use")).uid;
  });


  describe("the client bundle", function(){
    it("is loaded for logged-in users, with their own stream", async function(){
      const {text} = await page(this.server, "/ui/tags");
      expect(text).to.include(`data-stream="/events/users/${owner}"`);
      expect(text).to.include(`src="/dist/js/events.js`);
      expect(text).to.include(`id="nav-notifications"`);
    });

    it("shows where the user is, in the navbar", async function(){
      const active = (text: string)=> [...text.matchAll(/<a class="btn[^"]*nav-btn([^"]*)" href="([^"]+)"/g)]
        .filter(m=> m[1].includes("active"))
        .map(m=> m[2]);
      expect(active((await page(this.server, "/ui/tags")).text)).to.deep.equal([]);
      expect(active((await page(this.server, "/ui/user/")).text)).to.deep.equal(["/ui/user/"]);
      expect(active((await page(this.server, "/ui/user/notifications?status=unread")).text))
        .to.deep.equal(["/ui/user/"]);
    });

    it("has a list to open from the navbar", async function(){
      const {text} = await page(this.server, "/ui/tags");
      expect(text).to.match(/<button id="nav-notifications"[^>]* popovertarget="nav-notifications-panel"/);
      expect(text).to.match(/<div id="nav-notifications-panel" popover/);
      expect(text).to.include(`href="/ui/user/tasks"`);
    });

    it("isn't loaded for anonymous visitors", async function(){
      const {text} = await page(this.server, "/ui/tags", {as: null});
      expect(text).not.to.include("events.js");
      expect(text).not.to.include("nav-notifications");
    });

    it("is loaded for the lowest level of account, that's allowed to use it", async function(){
      const {text} = await page(this.server, "/ui/tags", {as: "lowest"});
      expect(text).to.include(`data-stream="/events/users/${lowest}"`);
      await request(this.server).head(`/events/users/${lowest}`)
        .set("Authorization", await bearer("lowest"))
        .expect(200);
    });

    it("isn't loaded when the feature is disabled", async function(){
      await config.set("enable_events", false);
      const {text} = await page(this.server, "/ui/tags");
      expect(text).not.to.include("events.js");
      expect(text).not.to.include("nav-notifications");
    });
  });


  describe("GET /ui/tasks/:id", function(){
    /** @returns the ID of the task along with the one of the notification */
    async function notifiedTask(user_id = owner){
      const task = await taskScheduler.create({type: "testTask", data: {}, user_id, notify: true, status: "running"});
      await taskScheduler.releaseTask(task.task_id);
      const [notification] = await userManager.getNotifications(user_id, {limit: 1});
      return {task_id: task.task_id, notification_id: notification.notification_id};
    }
    const isRead = async (uid: number, id: number)=>{
      const all = await userManager.getNotifications(uid, {unreadOnly: false, limit: 100});
      return all.find(n=> n.notification_id === id)!.read_at !== null;
    };

    it("marks the notification about this task as read", async function(){
      const {task_id, notification_id} = await notifiedTask();
      await page(this.server, `/ui/tasks/${task_id}`);
      expect(await isRead(owner, notification_id)).to.equal(true);
    });

    it("has the count right on the page that does it", async function(){
      const {task_id} = await notifiedTask();
      await notifiedTask();
      await page(this.server, `/ui/tasks/${task_id}`);
      expect(await userManager.getUnreadSummary(owner)).to.deep.equal({unread: 1, errors: 0});
    });

    it("leaves other notifications alone", async function(){
      const {task_id} = await notifiedTask();
      const {notification_id} = await notifiedTask();
      await page(this.server, `/ui/tasks/${task_id}`);
      expect(await isRead(owner, notification_id)).to.equal(false);
    });

    it("works with any filter on its logs", async function(){
      const {task_id, notification_id} = await notifiedTask();
      await page(this.server, `/ui/tasks/${task_id}?level=error`);
      expect(await isRead(owner, notification_id)).to.equal(true);
    });

    it("keeps the time it was first read at", async function(){
      const {task_id, notification_id} = await notifiedTask();
      await page(this.server, `/ui/tasks/${task_id}`);
      const read_at = async ()=> (await userManager.getNotifications(owner, {unreadOnly: false})).find(n=> n.notification_id === notification_id)!.read_at;
      const first = await read_at();
      await page(this.server, `/ui/tasks/${task_id}`);
      expect(await read_at()).to.deep.equal(first);
    });

    it("is fine with a task nobody is notified about", async function(){
      const task = await taskScheduler.create({type: "testTask", data: {}, user_id: owner, status: "success"});
      await page(this.server, `/ui/tasks/${task.task_id}`);
    });

    it("doesn't read someone else's notification, for an admin looking at their task", async function(){
      await userManager.addUser("admin", "12345678", "admin");
      const {task_id, notification_id} = await notifiedTask();
      await page(this.server, `/ui/tasks/${task_id}`, {as: "admin"});
      expect(await isRead(owner, notification_id)).to.equal(false);
    });

    it("doesn't do anything for those who aren't allowed to see it", async function(){
      const {task_id, notification_id} = await notifiedTask();
      await page(this.server, `/ui/tasks/${task_id}`, {as: "other", status: 401});
      await page(this.server, `/ui/tasks/${task_id}`, {as: null, status: 401});
      expect(await isRead(owner, notification_id)).to.equal(false);
    });

    it("isn't a visit when it's only a HEAD request", async function(){
      const {task_id, notification_id} = await notifiedTask();
      await request(this.server).head(`/ui/tasks/${task_id}`).set("Authorization", await bearer("owner")).expect(200);
      expect(await isRead(owner, notification_id)).to.equal(false);
    });

    describe("with a token", function(){
      const token = async (scope: string[])=>{
        const {token} = await userManager.createToken(owner, {name: "test", scope});
        return `Bearer ${token}`;
      };

      it("doesn't change anything, if it's only allowed to read tasks", async function(){
        const {task_id, notification_id} = await notifiedTask();
        await request(this.server).get(`/ui/tasks/${task_id}`).set("Authorization", await token(["tasks:read"])).expect(200);
        expect(await isRead(owner, notification_id)).to.equal(false);
      });

      it("marks it as read if it's allowed to change the account", async function(){
        const {task_id, notification_id} = await notifiedTask();
        await request(this.server).get(`/ui/tasks/${task_id}`).set("Authorization", await token(["tasks:read", "account:write"])).expect(200);
        expect(await isRead(owner, notification_id)).to.equal(true);
      });
    });
  });


  describe("GET /ui/user/tasks", function(){
    const url = "/ui/user/tasks";
    const option = /<option value="unread"([^>]*)>/;

    async function notifiedTask({user_id = owner, fail = false} = {}){
      const task = await taskScheduler.create({type: "testTask", data: {}, user_id, notify: true, status: "running"});
      if(fail) await taskScheduler.errorTask(task.task_id, new Error("Task failed"));
      else await taskScheduler.releaseTask(task.task_id);
      return task.task_id;
    }
    const link = (task_id: number)=> `testTask#${task_id}`;

    it("offers to show what has an unread notification", async function(){
      const {text} = await page(this.server, url);
      expect(text).to.include("Unread notifications");
      expect(option.exec(text)?.[1], "not by default").not.to.include("selected");
      expect(text).to.match(/<option value="true" selected>/);
    });

    it("only shows those", async function(){
      const unread = await notifiedTask();
      const read = await notifiedTask();
      const notified = await userManager.getNotifications(owner, {limit: 1});
      await userManager.markNotificationsRead(owner, {ids: [notified[0].notification_id]});
      const quiet = (await taskScheduler.create({type: "testTask", data: {}, user_id: owner, status: "success"})).task_id;
      const {text} = await page(this.server, `${url}?rootOnly=unread`);
      expect(text).to.include(link(unread));
      expect(text).not.to.include(link(read));
      expect(text).not.to.include(link(quiet));
      expect(option.exec(text)?.[1], "as the selected option").to.include("selected");
      expect(text).not.to.match(/<option value="true" selected>/);
      expect(text).not.to.match(/<option value="false" selected>/);
    });

    it("doesn't change what's shown otherwise", async function(){
      const read = await notifiedTask();
      await userManager.markNotificationsRead(owner, {task_id: read});
      for(const query of ["", "?rootOnly=true", "?rootOnly=false"]){
        expect((await page(this.server, url+query)).text, query).to.include(link(read));
      }
    });

    it("doesn't show the tasks of others", async function(){
      const theirs = await notifiedTask({user_id: other});
      const {text} = await page(this.server, `${url}?rootOnly=unread`);
      expect(text).not.to.include(link(theirs));
    });

    it("doesn't count a notification meant for someone else, about one of your tasks", async function(){
      const {task_id} = await taskScheduler.create({type: "testTask", data: {}, user_id: owner, status: "success"});
      await taskScheduler.db.run(`INSERT INTO notifications(fk_user_id, type, fk_task_id) VALUES ($1, 'task', $2)`, [other, task_id]);
      const {text} = await page(this.server, `${url}?rootOnly=unread`);
      expect(text).not.to.include(link(task_id));
    });

    it("goes along with the other filters", async function(){
      const success = await notifiedTask();
      const failure = await notifiedTask({fail: true});
      const {text} = await page(this.server, `${url}?rootOnly=unread&status=error`);
      expect(text).to.include(link(failure));
      expect(text).not.to.include(link(success));
    });

    it("no longer shows a task once it's been visited", async function(){
      const task_id = await notifiedTask();
      await page(this.server, `/ui/tasks/${task_id}`);
      const {text} = await page(this.server, `${url}?rootOnly=unread`);
      expect(text).not.to.include(link(task_id));
    });

    it("doesn't explain what tasks are when there's just nothing unread", async function(){
      expect((await page(this.server, url)).text, "for comparison").to.include("help-block");
      const {text} = await page(this.server, `${url}?rootOnly=unread`);
      expect(text).not.to.include("help-block");
      expect(text).to.include("No tasks found");
    });

    it("isn't offered on the other lists of tasks", async function(){
      await userManager.addUser("admin", "12345678", "admin");
      const {text} = await page(this.server, "/ui/admin/tasks", {as: "admin"});
      expect(text).to.include(`value="false"`);
      expect(text).not.to.match(option);
    });
  });


  describe("GET /ui/user/notifications", function(){
    const url = "/ui/user/notifications";

    it("isn't linked from anywhere for now, as long as we try out the list in the navbar", async function(){
      for(const path of ["/ui/tags", "/ui/user/", url]){
        const {text} = await page(this.server, path);
        expect(text, path).not.to.include(`href="/ui/user/notifications"`);
      }
    });

    it("redirects anonymous visitors to the login page", async function(){
      const res = await page(this.server, url, {as: null, status: 302});
      expect(res.headers.location).to.include("/auth/login");
    });

    it("doesn't exist when the feature is disabled", async function(){
      await config.set("enable_events", false);
      await page(this.server, url, {status: 404});
    });

    it("says when there's nothing to show", async function(){
      const {text} = await page(this.server, url);
      expect(text).to.include("No notifications.");
      expect(text).not.to.include(`id="inbox-mark-all"`);
    });

    it("only shows the user's own", async function(){
      await notify({user_id: other});
      const {text} = await page(this.server, url);
      expect(text).not.to.include("data-notification-id");
      expect(text).not.to.include(`id="inbox-mark-all"`);
    });

    it("doesn't mark anything as read", async function(){
      await notify();
      await page(this.server, url);
      expect(await userManager.countUnreadNotifications(owner)).to.equal(1);
    });

    it("tells unread notifications from the others, and links them to their task", async function(){
      const first = await notify();
      const second = await notify({fail: true});
      await userManager.markNotificationsRead(owner, {ids: [first]});
      const {text} = await page(this.server, url);
      expect(text).to.include(`class="inbox-item unread" data-notification-id="${second}"`);
      expect(text).to.include(`class="inbox-item" data-notification-id="${first}"`);
      expect(text.match(/class="[^"]*inbox-mark-read/g), "those that can be marked").to.have.length(1);
      expect(text).to.match(/class="inbox-item-message" href="\/ui\/tasks\/\d+"/);
    });

    it("can be limited to unread notifications", async function(){
      const first = await notify();
      const second = await notify();
      await userManager.markNotificationsRead(owner, {ids: [first]});
      const {text} = await page(this.server, `${url}?status=unread`);
      expect(text).to.include(`data-notification-id="${second}"`);
      expect(text).not.to.include(`data-notification-id="${first}"`);
    });

    it("refuses an invalid status", async function(){
      await page(this.server, `${url}?status=foo`, {status: 400});
    });

    it("marks everything up to the newest, which is only known to the first page", async function(){
      await notify();
      const newest = await notify();
      let {text} = await page(this.server, `${url}?limit=1`);
      expect(text).to.include(`data-up-to="${newest}"`);
      ({text} = await page(this.server, `${url}?limit=1&offset=1`));
      expect(text).not.to.include(`id="inbox-mark-all"`);
    });

    it("offers to mark all as long as anything is unread, even if not on this page", async function(){
      const oldest = await notify();
      const newest = await notify();
      await userManager.markNotificationsRead(owner, {ids: [newest]});
      const {text} = await page(this.server, `${url}?limit=1`);
      expect(text).not.to.include(`data-notification-id="${oldest}"`);
      expect(text).to.include(`data-up-to="${newest}"`);
    });

    it("has nothing to mark once everything is read", async function(){
      const id = await notify();
      await userManager.markNotificationsRead(owner, {upTo: id});
      const {text} = await page(this.server, url);
      expect(text).to.include(`data-notification-id="${id}"`);
      expect(text).not.to.include(`id="inbox-mark-all"`);
    });

    it("pages through notifications", async function(){
      const ids = [await notify(), await notify(), await notify()];
      let {text} = await page(this.server, `${url}?limit=2`);
      expect(text).to.include(`data-notification-id="${ids[2]}"`);
      expect(text).to.include(`data-notification-id="${ids[1]}"`);
      expect(text).not.to.include(`data-notification-id="${ids[0]}"`);
      const next = /id="search-next" href="([^"]+)"/.exec(text)?.[1];
      expect(next, "a link to the next page").to.be.ok;
      ({text} = await page(this.server, next!.replace(/&amp;/g, "&").replace(/&#x3D;/g, "=")));
      expect(text).to.include(`data-notification-id="${ids[0]}"`);
      expect(text).to.include(`id="search-previous"`);
    });

    it("has no pager when it all fits in a page", async function(){
      await notify();
      const {text} = await page(this.server, url);
      expect(text).not.to.include("search-next");
      expect(text).not.to.include("search-previous");
      expect(text).not.to.include("leads.noResults");
    });
  });
});
