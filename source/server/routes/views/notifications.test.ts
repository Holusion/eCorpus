import request from "supertest";

import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import { Config } from "../../utils/config.js";
import Vfs from "../../vfs/index.js";


describe("Notifications in the UI", function(){
  let userManager: UserManager, taskScheduler: TaskScheduler, config: Config, vfs: Vfs;
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
    vfs = locals.vfs;
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
      expect(text).to.include(`<a class="btn btn-outline" href="/ui/user/notifications">`);
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

    async function task(params: {parent?: number, user_id?: number, status?: "success"|"error", scene_id?: number, type?: string, notify?: boolean} = {}){
      const {status = "success", type = "testTask", user_id = owner, notify = false, ...rest} = params;
      const created = await taskScheduler.create({type, data: {}, user_id, notify, status: "running", ...rest});
      if(status === "error") await taskScheduler.errorTask(created.task_id, new Error("Task failed"));
      else await taskScheduler.releaseTask(created.task_id);
      return created.task_id;
    }
    const link = (task_id: number)=> `href="/ui/tasks/${task_id}"`;
    /** The markup of what's displayed for a task, without what's under it */
    const rowOf = (text: string, task_id: number)=>{
      const row = text.match(/<div class="task-row[ "].*?<\/a>\s*<\/div>\s*<\/div>/gs)?.find(r=> r.includes(`#${task_id}\n`) || r.includes(`#${task_id} `));
      expect(row, `row of task #${task_id}`).to.be.a("string");
      return row!;
    };

    describe("rows", function(){
      it("show the type of a task, and how to get to it", async function(){
        const id = await task();
        const {text} = await page(this.server, url);
        expect(rowOf(text, id)).to.include(`<a class="task-row-type" ${link(id)}>testTask</a>`);
      });

      it("say what scene it's on, when it has one", async function(){
        const scene_id = await vfs.createScene("foo", owner);
        const id = await task({scene_id});
        const none = await task();
        const {text} = await page(this.server, url);
        expect(rowOf(text, id)).to.match(/>testTask<\/a>\s*<span class="task-row-scene">on ‹<a href="\/ui\/scenes\/foo">foo<\/a>›<\/span>/);
        expect(rowOf(text, none)).not.to.include("/ui/scenes/");
        expect(rowOf(text, none)).not.to.include("‹");
      });

      it("say so in the language of the page", async function(){
        const scene_id = await vfs.createScene("foo", owner);
        const id = await task({scene_id});
        const {text} = await page(this.server, `${url}?lang=fr`);
        expect(rowOf(text, id)).to.include("sur ‹");
      });

      it("escape what comes from a scene's name", async function(){
        const scene_id = await vfs.createScene("<b>foo</b>", owner);
        const {text} = await (async ()=>{ await task({scene_id}); return page(this.server, url); })();
        expect(text).not.to.include("<b>foo</b>");
      });

      it("have the date and ID on a second line", async function(){
        const id = await task();
        const {text} = await page(this.server, url);
        expect(rowOf(text, id)).to.match(new RegExp(`<small class="task-row-details">[^<]*\\d[^<]*#${id}`));
      });

      it("show the status, linking to the task", async function(){
        const id = await task({status: "error"});
        const {text} = await page(this.server, url);
        expect(rowOf(text, id)).to.include(`<a ${link(id)} class="task-status task-status-large status-error">error</a>`);
      });

      it("only show the owner to those looking at everyone's tasks", async function(){
        await userManager.addUser("admin", "12345678", "admin");
        const id = await task();
        expect(rowOf((await page(this.server, "/ui/admin/tasks", {as: "admin"})).text, id)).to.include(">owner</a>");
        expect(rowOf((await page(this.server, url)).text, id)).not.to.include(">owner</a>");
      });
    });

    describe("hierarchy", function(){
      const all = `${url}?rootOnly=false`;

      /** The list that's right under the row of a task, up to where it closes */
      function under(text: string, id: number){
        const start = text.indexOf(`&mdash; #${id}`);
        expect(start, `task #${id}`).to.be.above(-1);
        const details = text.lastIndexOf("<details", start);
        const opened = text.indexOf('<ul class="task-rows">', start);
        expect(details, `collapsible tree of #${id}`).to.be.above(-1);
        let depth = 1, i = opened + 1;
        const tag = /<(\/?)ul[ >]/g;
        tag.lastIndex = i;
        let m: RegExpExecArray|null;
        while(depth && (m = tag.exec(text))){
          depth += m[1] ? -1 : 1;
          i = tag.lastIndex;
        }
        return text.slice(opened, i);
      }

      it("only shows root tasks by default, with nothing to unfold", async function(){
        const root = await task();
        const child = await task({parent: root});
        const {text} = await page(this.server, url);
        expect(text).to.include(link(root));
        expect(text).not.to.include(link(child));
        expect(text).not.to.include("<details");
        expect(text).not.to.include("task-rows-tree");
      });

      it("shows what's under a task, nested in something that can be collapsed", async function(){
        const root = await task();
        const child = await task({parent: root});
        const {text} = await page(this.server, all);
        expect(text).to.include("task-rows-tree");
        expect(text).to.match(/<details open>\s*<summary>/);
        expect(under(text, root)).to.include(link(child));
      });

      it("goes as deep as it has to, each with its own tree", async function(){
        const root = await task();
        const child = await task({parent: root});
        const grandchild = await task({parent: child});
        const {text} = await page(this.server, all);
        expect(under(text, root)).to.include(link(grandchild));
        expect(under(text, child)).to.include(link(grandchild));
        expect(text.match(/<details/g)).to.have.length(2);
      });

      it("doesn't show a task twice", async function(){
        const root = await task();
        const child = await task({parent: root});
        const {text} = await page(this.server, all);
        expect(text.match(new RegExp(`<a class="task-row-type" ${link(child)}`, "g"))).to.have.length(1);
      });

      it("keeps a task with nothing under it simple", async function(){
        await task();
        const {text} = await page(this.server, all);
        expect(text).not.to.include("<details");
      });

      it("keeps those under a task in order", async function(){
        const root = await task();
        const first = await task({parent: root});
        const second = await task({parent: root});
        const list = under((await page(this.server, all)).text, root);
        expect(list.indexOf(link(first))).to.be.below(list.indexOf(link(second)));
      });

      it("shows the newest trees first", async function(){
        const older = await task();
        const newer = await task();
        const {text} = await page(this.server, all);
        expect(text.indexOf(link(newer))).to.be.below(text.indexOf(link(older)));
      });

      it("counts trees when limiting, not what's in them", async function(){
        const older = await task();
        const newer = await task();
        const children = [await task({parent: newer}), await task({parent: newer}), await task({parent: newer})];
        const {text} = await page(this.server, `${all}&limit=1`);
        for(const child of children) expect(text).to.include(link(child));
        expect(text).not.to.include(link(older));
      });

      it("goes to the next tree with an offset", async function(){
        const older = await task();
        const newer = await task();
        const {text} = await page(this.server, `${all}&limit=1&offset=1`);
        expect(text).to.include(link(older));
        expect(text).not.to.include(link(newer));
      });

      it("shows a task that matches a filter, even if its parent doesn't", async function(){
        const root = await task();
        const failed = await task({parent: root, status: "error"});
        const {text} = await page(this.server, `${all}&status=error`);
        expect(text).to.include(link(failed));
        expect(text).not.to.include(`<a class="task-row-type" ${link(root)}`);
      });

      it("shows what's under a task that matches a filter, whatever it is", async function(){
        const root = await task({status: "error"});
        const child = await task({parent: root});
        const {text} = await page(this.server, `${all}&status=error`);
        expect(under(text, root)).to.include(link(child));
      });

      it("keeps a child nested when both it and its parent match", async function(){
        const root = await task({status: "error"});
        const child = await task({parent: root, status: "error"});
        const {text} = await page(this.server, `${all}&status=error`);
        expect(under(text, root)).to.include(link(child));
        expect(text.match(new RegExp(`<a class="task-row-type" ${link(child)}`, "g"))).to.have.length(1);
      });

      it("works with a filter on the type", async function(){
        const root = await task();
        const other = await task({parent: root, type: "otherTask"});
        const {text} = await page(this.server, `${all}&type=otherTask`);
        expect(text).to.include(link(other));
        expect(text).not.to.include(`<a class="task-row-type" ${link(root)}`);
      });

      it("doesn't show the tasks of others", async function(){
        const theirs = await task({user_id: other});
        const {text} = await page(this.server, all);
        expect(text).not.to.include(link(theirs));
      });

      it("works on the other lists of tasks", async function(){
        await userManager.addUser("admin", "12345678", "admin");
        const root = await task();
        const child = await task({parent: root});
        const {text} = await page(this.server, "/ui/admin/tasks?rootOnly=false", {as: "admin"});
        expect(under(text, root)).to.include(link(child));

        const scene_id = await vfs.createScene("foo", owner);
        const sceneRoot = await task({scene_id});
        const sceneChild = await task({parent: sceneRoot, scene_id});
        const inScene = await page(this.server, "/ui/scenes/foo/tasks?rootOnly=false");
        expect(under(inScene.text, sceneRoot)).to.include(link(sceneChild));
      });
    });

    it("knows nothing about notifications", async function(){
      const id = await task({notify: true});
      const {text} = await page(this.server, url);
      const row = rowOf(text, id);
      expect(row).to.match(/^<div class="task-row">/);
      expect(row).not.to.include("<button");
      expect(text).not.to.include("js/inbox.js");
    });

    it("no longer has a view of notifications", async function(){
      const {text} = await page(this.server, url);
      expect(text).not.to.match(/<option value="notifications"/);
      expect(text).not.to.include("inbox-delete");
    });

  });


  describe("GET /ui/user/notifications", function(){
    const url = "/ui/user/notifications";

    it("is linked from the pages of a user", async function(){
      const {text} = await page(this.server, "/ui/user/");
      expect(text).to.match(/<div class="grid-toolbar">.*href="\/ui\/user\/notifications"/s);
    });

    it("isn't linked from anywhere when the feature is disabled", async function(){
      await config.set("enable_events", false);
      for(const path of ["/ui/tags", "/ui/user/"]){
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
