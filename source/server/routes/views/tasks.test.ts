import request from "supertest";

import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import Vfs from "../../vfs/index.js";
import { BadRequestError } from "../../utils/errors.js";


describe("Lists of tasks in the UI", function(){
  let userManager: UserManager, taskScheduler: TaskScheduler, vfs: Vfs;
  let owner: number, other: number;

  /** Requests a page, by default as the owner of the tasks */
  async function page(server: any, path: string, {status = 200, as = "owner" as string|null} = {}){
    const req = request(server).get(path);
    if(as) req.set("Authorization", await bearer(as));
    return await req.expect(status);
  }

  async function task(params: {parent?: number, user_id?: number|null, status?: "success"|"error", scene_id?: number, type?: string} = {}){
    const {status = "success", type = "testTask", user_id = owner, ...rest} = params;
    const created = await taskScheduler.create({type, data: {}, user_id, status: "running", ...rest});
    if(status === "error") await taskScheduler.errorTask(created.task_id, new Error("Task failed"));
    else await taskScheduler.releaseTask(created.task_id);
    return created.task_id;
  }
  const link = (task_id: number)=> `href="/ui/tasks/${task_id}"`;

  this.beforeAll(async function(){
    const locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    taskScheduler = locals.taskScheduler;
    vfs = locals.vfs;
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
      expect(text).to.include(`<a class="task-row-owner" href="/ui/users/${owner}/tasks">owner</a>`);
    });

    it("keeps the filters on type and status on that link", async function(){
      await task({status: "error", type: "some task"});
      const filtered = async (query: string)=> (await page(this.server, `${url}?${query}`, {as: "admin"})).text;
      expect(await filtered(`type=${encodeURIComponent("some task")}&status=error`))
        .to.include(`<a class="task-row-owner" href="/ui/users/${owner}/tasks?type=some%20task&amp;status=error">owner</a>`);
      expect(await filtered(`type=${encodeURIComponent("some task")}`))
        .to.include(`<a class="task-row-owner" href="/ui/users/${owner}/tasks?type=some%20task">owner</a>`);
      expect(await filtered(`status=error`))
        .to.include(`<a class="task-row-owner" href="/ui/users/${owner}/tasks?status=error">owner</a>`);
    });

    it("leaves out a status that doesn't filter anything", async function(){
      await task();
      const {text} = await page(this.server, `${url}?status=all`, {as: "admin"});
      expect(text).to.include(`<a class="task-row-owner" href="/ui/users/${owner}/tasks">owner</a>`);
    });

    it("is only for admins", async function(){
      await page(this.server, url, {as: "owner", status: 401});
    });
  });

  describe("GET /ui/users/:uid/tasks", function(){
    let url: string;
    this.beforeEach(function(){
      url = `/ui/users/${owner}/tasks`;
    });

    /** The markup of what's displayed for a task, without what's under it */
    const rowOf = (text: string, task_id: number)=>{
      const row = text.match(/<div class="task-row">.*?<\/time>\s*<\/small>\s*<\/div>\s*<\/div>/gs)?.find(r=> r.includes(`id="task-${task_id}-details"`));
      expect(row, `row of task #${task_id}`).to.be.a("string");
      return row!;
    };

    describe("type filter", function(){
      /** What's in the type's box, and what it suggests */
      function typeField(text: string){
        const input = text.match(/<input id="task-list-type" name="type" type="search" list="task-list-types"[^>]* value="([^"]*)"/);
        expect(input, "type input").not.to.be.null;
        const datalist = text.match(/<datalist id="task-list-types">(.*?)<\/datalist>/s)?.[1];
        expect(datalist, "type suggestions").to.be.a("string");
        return {value: input![1], suggestions: [...datalist!.matchAll(/<option value="([^"]*)">/g)].map(o => o[1])};
      }

      it("suggests the types of the user's tasks, those under them included", async function(){
        const root = await task({type: "b"});
        await task({type: "a", parent: root});
        await task({type: "c", user_id: other});
        expect(typeField((await page(this.server, url)).text)).to.deep.equal({value: "", suggestions: ["a", "b"]});
      });

      it("keeps the one that's asked for in its box", async function(){
        await task({type: "a"});
        await task({type: "b"});
        expect(typeField((await page(this.server, `${url}?type=b`)).text)).to.deep.equal({value: "b", suggestions: ["a", "b"]});
      });

      it("keeps a type there are no tasks of, without suggesting it", async function(){
        await task({type: "a"});
        expect(typeField((await page(this.server, `${url}?type=z`)).text)).to.deep.equal({value: "z", suggestions: ["a"]});
      });

      it("escapes the types", async function(){
        await task({type: `"><b>x</b>`});
        const {text} = await page(this.server, `${url}?type=${encodeURIComponent(`"><i>y</i>`)}`);
        expect(text).not.to.include("<b>x</b>");
        expect(text).not.to.include("<i>y</i>");
      });

      it("suggests the types of a scene's tasks on its page, and everyone's to admins", async function(){
        const scene_id = await vfs.createScene("foo", owner);
        await task({type: "inScene", scene_id});
        await task({type: "mine"});
        await task({type: "theirs", user_id: other});
        expect(typeField((await page(this.server, "/ui/scenes/foo/tasks")).text).suggestions).to.deep.equal(["inScene"]);
        expect(typeField((await page(this.server, "/ui/admin/tasks", {as: "admin"})).text).suggestions).to.deep.equal(["inScene", "mine", "theirs"]);
      });

      it("suggests the user's types to an admin looking at their list", async function(){
        await task({type: "mine"});
        await task({type: "theirs", user_id: other});
        expect(typeField((await page(this.server, `/ui/users/${other}/tasks`, {as: "admin"})).text).suggestions).to.deep.equal(["theirs"]);
      });
    });

    describe("pages", function(){
      const unescape = (href?: string)=> href?.replace(/&#x3D;/g, "=").replace(/&amp;/g, "&");
      const next = (text: string)=> unescape(text.match(/<a class="btn btn-main"\s*id="search-next" href="([^"]*)"/)?.[1]);
      const previous = (text: string)=> unescape(text.match(/<a class="btn btn-main" id="search-previous" href="([^"]*)"/)?.[1]);

      it("have no pager when everything fits in one", async function(){
        await task();
        const {text} = await page(this.server, url);
        expect(text).not.to.include("search-next");
        expect(text).not.to.include("search-previous");
      });

      it("link to the next one when this one is full, with the same filters", async function(){
        for(let i = 0; i < 3; i++) await task({type: "a", status: "error"});
        const {text} = await page(this.server, `${url}?type=a&status=error&limit=2`);
        expect(next(text)).to.equal(`${url}?type=a&status=error&limit=2&offset=2`);
        expect(previous(text)).to.be.undefined;
        expect(text).to.match(/>\s*0-2\s*</);
      });

      it("link back to the previous one, down to the first", async function(){
        for(let i = 0; i < 3; i++) await task();
        const {text} = await page(this.server, `${url}?limit=2&offset=2`);
        expect(previous(text)).to.equal(`${url}?limit=2&offset=0`);
        expect(next(text)).to.be.undefined;
        expect(text).to.match(/>\s*2-3\s*</);
        expect(previous((await page(this.server, `${url}?limit=2&offset=1`)).text), "not before the first").to.equal(`${url}?limit=2&offset=0`);
      });

      it("count trees, not what's in them", async function(){
        const older = await task();
        const newer = await task();
        await task({parent: newer});
        await task({parent: newer});
        const {text} = await page(this.server, `${url}?limit=1`);
        expect(text).to.match(/>\s*0-1\s*</);
        expect(next(text)).to.equal(`${url}?limit=1&offset=1`);
        const second = await page(this.server, next(text)!);
        expect(second.text).to.include(link(older));
      });

      it("still lead back from past the end", async function(){
        await task();
        const {text} = await page(this.server, `${url}?offset=20`);
        expect(previous(text)).to.equal(`${url}?offset=0`);
        expect(text).not.to.include("No tasks found.");
      });

      it("are on the admin list too", async function(){
        for(let i = 0; i < 2; i++) await task();
        const {text} = await page(this.server, "/ui/admin/tasks?limit=1", {as: "admin"});
        expect(next(text)).to.equal("/ui/admin/tasks?limit=1&offset=1");
      });

      it("are on the scene's list too", async function(){
        const scene_id = await vfs.createScene("foo", owner);
        for(let i = 0; i < 2; i++) await task({scene_id});
        const {text} = await page(this.server, "/ui/scenes/foo/tasks?limit=1");
        expect(next(text)).to.equal("/ui/scenes/foo/tasks?limit=1&offset=1");
      });
    });

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

      it("have their ID, linking to the task, then their owner and date on a last line", async function(){
        const id = await task();
        const {text} = await page(this.server, url);
        expect(rowOf(text, id)).to.match(new RegExp(
          `</span>\\s*<small class="task-row-details" id="task-${id}-details">\\s*<a class="task-row-id" ${link(id)}>#${id}</a>`
          +`\\s*&mdash;\\s*<[^>]+class="task-row-owner"[^>]*>owner</(a|span)>`
          +`\\s*<time class="task-row-time" datetime="\\d{4}-[^"]+Z">[^<]*\\d[^<]*</time>\\s*</small>\\s*</div>\\s*</div>$`
        ));
      });

      it("say why they failed, at the end of their title, before that line", async function(){
        const failed = await task({status: "error"});
        const done = await task();
        const {text} = await page(this.server, url);
        expect(rowOf(text, failed)).to.match(new RegExp(
          `<span class="task-row-title" id="task-${failed}-title">.*?`
          +`<span class="task-row-reason text-error">Task failed</span>\\s*</span>`
          +`\\s*<small class="task-row-details"`, "s"
        ));
        expect(rowOf(text, done)).not.to.include("task-row-reason");
      });

      it("show their status first, as an icon, with its name for those who can't see it", async function(){
        const done = await task();
        const failed = await task({status: "error"});
        const {task_id: running} = await taskScheduler.create({type: "testTask", data: {}, user_id: owner, status: "running"});
        const {text} = await page(this.server, url);
        const status = (id: number)=> rowOf(text, id).match(new RegExp(`^<div class="task-row">\\s*<span class="task-row-status" id="task-${id}-status" title="([a-z]+)">\\s*(.*?)\\s*<span class="visually-hidden">([a-z]+)</span>\\s*</span>\\s*<div class="task-row-content">`, "s"))?.slice(1);
        expect(status(done)).to.deep.equal(["success", `<ui-icon class="text-success" name="check"></ui-icon>`, "success"]);
        expect(status(failed)).to.deep.equal(["error", `<ui-icon class="text-error" name="error"></ui-icon>`, "error"]);
        expect(status(running)).to.deep.equal(["running", `<cube-loader></cube-loader>`, "running"]);
      });

      it("say why they failed in the language of the page", async function(){
        const {task_id: id} = await taskScheduler.create({type: "testTask", data: {}, user_id: owner, status: "running"});
        await taskScheduler.errorTask(id, new BadRequestError());
        expect((await page(this.server, `${url}?lang=fr`)).text).to.include(`<span class="task-row-reason text-error">Requête incorrecte</span>`);
        expect((await page(this.server, url)).text).to.include(`<span class="task-row-reason text-error">Bad Request</span>`);
      });

      it("link the owner to their tasks, but not on that list itself", async function(){
        const id = await task();
        expect(rowOf((await page(this.server, "/ui/admin/tasks", {as: "admin"})).text, id))
          .to.include(`<a class="task-row-owner" href="/ui/users/${owner}/tasks">owner</a>`);
        for(const as of ["owner", "admin"]){
          const row = rowOf((await page(this.server, url, {as})).text, id);
          expect(row, as).to.include(`<span class="task-row-owner">owner</span>`);
          expect(row, as).not.to.include(">owner</a>");
        }
      });

      it("are labelled by their title, details and status", async function(){
        const id = await task();
        const {text} = await page(this.server, url);
        expect(text).to.include(`<li aria-labelledby="task-${id}-title task-${id}-details task-${id}-status">`);
        for(const part of ["title", "details", "status"]){
          expect(text.match(new RegExp(` id="task-${id}-${part}"`, "g")), part).to.have.length(1);
        }
      });
    });

    describe("hierarchy", function(){

      /** The list that's right under the row of a task, up to where it closes */
      function under(text: string, id: number){
        const start = text.indexOf(`id="task-${id}-details"`);
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

      it("shows what's under a task, in a tree that starts collapsed", async function(){
        const root = await task();
        const child = await task({parent: root});
        const {text} = await page(this.server, url);
        expect(text).to.match(/<details>\s*<summary>/);
        expect(text).not.to.include("<details open");
        expect(under(text, root)).to.include(link(child));
      });

      it("has no view of root tasks only", async function(){
        const root = await task();
        const child = await task({parent: root});
        const {text} = await page(this.server, `${url}?rootOnly=true`);
        expect(text).not.to.include(`name="rootOnly"`);
        expect(under(text, root)).to.include(link(child));
      });

      it("goes as deep as it has to, each with its own tree", async function(){
        const root = await task();
        const child = await task({parent: root});
        const grandchild = await task({parent: child});
        const {text} = await page(this.server, url);
        expect(under(text, root)).to.include(link(grandchild));
        expect(under(text, child)).to.include(link(grandchild));
        expect(text.match(/<details/g)).to.have.length(2);
      });

      it("doesn't show a task twice", async function(){
        const root = await task();
        const child = await task({parent: root});
        const {text} = await page(this.server, url);
        expect(text.match(new RegExp(`<a class="task-row-type" ${link(child)}`, "g"))).to.have.length(1);
      });

      it("keeps a task with nothing under it simple", async function(){
        await task();
        const {text} = await page(this.server, url);
        expect(text).not.to.include("<details");
      });

      it("keeps those under a task in order", async function(){
        const root = await task();
        const first = await task({parent: root});
        const second = await task({parent: root});
        const list = under((await page(this.server, url)).text, root);
        expect(list.indexOf(link(first))).to.be.below(list.indexOf(link(second)));
      });

      it("shows the newest trees first", async function(){
        const older = await task();
        const newer = await task();
        const {text} = await page(this.server, url);
        expect(text.indexOf(link(newer))).to.be.below(text.indexOf(link(older)));
      });

      it("counts trees when limiting, not what's in them", async function(){
        const older = await task();
        const newer = await task();
        const children = [await task({parent: newer}), await task({parent: newer}), await task({parent: newer})];
        const {text} = await page(this.server, `${url}?limit=1`);
        for(const child of children) expect(text).to.include(link(child));
        expect(text).not.to.include(link(older));
      });

      it("goes to the next tree with an offset", async function(){
        const older = await task();
        const newer = await task();
        const {text} = await page(this.server, `${url}?limit=1&offset=1`);
        expect(text).to.include(link(older));
        expect(text).not.to.include(link(newer));
      });

      it("shows a task that matches a filter, even if its parent doesn't", async function(){
        const root = await task();
        const failed = await task({parent: root, status: "error"});
        const {text} = await page(this.server, `${url}?status=error`);
        expect(text).to.include(link(failed));
        expect(text).not.to.include(`<a class="task-row-type" ${link(root)}`);
      });

      it("shows what's under a task that matches a filter, whatever it is", async function(){
        const root = await task({status: "error"});
        const child = await task({parent: root});
        const {text} = await page(this.server, `${url}?status=error`);
        expect(under(text, root)).to.include(link(child));
      });

      it("keeps a child nested when both it and its parent match", async function(){
        const root = await task({status: "error"});
        const child = await task({parent: root, status: "error"});
        const {text} = await page(this.server, `${url}?status=error`);
        expect(under(text, root)).to.include(link(child));
        expect(text.match(new RegExp(`<a class="task-row-type" ${link(child)}`, "g"))).to.have.length(1);
      });

      it("works with a filter on the type", async function(){
        const root = await task();
        const other = await task({parent: root, type: "otherTask"});
        const {text} = await page(this.server, `${url}?type=otherTask`);
        expect(text).to.include(link(other));
        expect(text).not.to.include(`<a class="task-row-type" ${link(root)}`);
      });

      it("doesn't show the tasks of others", async function(){
        const theirs = await task({user_id: other});
        const {text} = await page(this.server, url);
        expect(text).not.to.include(link(theirs));
      });

      it("works on the other lists of tasks", async function(){
        const root = await task();
        const child = await task({parent: root});
        const {text} = await page(this.server, "/ui/admin/tasks", {as: "admin"});
        expect(under(text, root)).to.include(link(child));

        const scene_id = await vfs.createScene("foo", owner);
        const sceneRoot = await task({scene_id});
        const sceneChild = await task({parent: sceneRoot, scene_id});
        const inScene = await page(this.server, "/ui/scenes/foo/tasks");
        expect(under(inScene.text, sceneRoot)).to.include(link(sceneChild));
      });
    });
  });
});
