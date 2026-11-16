import timers from "node:timers/promises";

import request from "supertest";

import { TaskScheduler } from "../../tasks/scheduler.js";
import UserManager from "../../auth/UserManager.js";
import Vfs from "../../vfs/index.js";
import { BadRequestError } from "../../utils/errors.js";


/** The pages of a task: its overview, its logs and its data */
const tabs = ["", "/logs", "/data"] as const;

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

  for(const tab of tabs){
    describe(`${tab || "(overview)"} is refused`, function(){
      it("to anonymous requests", async function(){
        const {task_id} = await createTask({user_id: owner});
        const {text} = await request(this.server).get(`/ui/tasks/${task_id}${tab}`).expect(401);
        expect(text).not.to.include(secret);
        expect(text).not.to.include("owner");
      });

      it("to anonymous requests, without telling which tasks exist", async function(){
        const {task_id} = await createTask({user_id: owner});
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`).expect(401);
        await request(this.server).get(`/ui/tasks/99999999${tab}`).expect(401);
      });

      it("to other users", async function(){
        const {task_id} = await createTask({user_id: owner});
        const {text} = await request(this.server).get(`/ui/tasks/${task_id}${tab}`)
          .set("Authorization", await bearer("other"))
          .expect(401);
        expect(text).not.to.include(secret);
      });

      it("for a task nobody owns, except to admins", async function(){
        const {task_id} = await createTask({user_id: null});
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`).expect(401);
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`).set("Authorization", await bearer("other")).expect(401);
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`).set("Authorization", await bearer("admin")).expect(200);
      });

      it("to a token without tasks:read", async function(){
        const {task_id} = await createTask({user_id: owner});
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`)
          .set("Authorization", await bearer("owner", ["scenes:read"]))
          .expect(403);
      });

      it("for a task on a private scene the user has no access to", async function(){
        const scene_id = await vfs.createScene(`private-scene${tab.replace("/", "-")}`, owner);
        await userManager.setPublicAccess(scene_id, "none");
        await userManager.setDefaultAccess(scene_id, "none");
        const {task_id} = await createTask({user_id: owner, scene_id});
        //Not a 401: scenes hide their existence from those who have no access to them
        const {text} = await request(this.server).get(`/ui/tasks/${task_id}${tab}`)
          .set("Authorization", await bearer("other"))
          .expect(404);
        expect(text).not.to.include(secret);
      });
    });

    describe(`${tab || "(overview)"} is shown`, function(){
      it("to the task's owner", async function(){
        const {task_id} = await createTask({user_id: owner});
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`)
          .set("Authorization", await bearer("owner"))
          .expect(200);
      });

      it("to admins", async function(){
        const {task_id} = await createTask({user_id: owner});
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`)
          .set("Authorization", await bearer("admin"))
          .expect(200);
      });

      it("to a token with tasks:read", async function(){
        const {task_id} = await createTask({user_id: owner});
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`)
          .set("Authorization", await bearer("owner", ["tasks:read"]))
          .expect(200);
      });

      it("to those who can read the task's scene, like GET /tasks/:id", async function(){
        const scene_id = await vfs.createScene(`shared-scene${tab.replace("/", "-")}`, owner);
        await userManager.setPublicAccess(scene_id, "none");
        await userManager.setDefaultAccess(scene_id, "none");
        await userManager.grant(scene_id, "other", "read");
        const {task_id} = await createTask({user_id: owner, scene_id});
        await request(this.server).get(`/ui/tasks/${task_id}${tab}`).set("Authorization", await bearer("other")).expect(200);
        await request(this.server).get(`/tasks/${task_id}`).set("Authorization", await bearer("other")).expect(200);
      });
    });
  }

  it("doesn't reveal the content of emails that anyone can trigger", async function(){
    await request(this.server).post(`/auth/login/owner/link`).expect(204);
    let task: {task_id: number}|undefined;
    for(let i = 0; !task && i < 100; i++){
      [task] = await taskScheduler.getTasks({type: "sendEmail", user_id: owner});
      if(!task) await timers.setTimeout(10);
    }
    expect(task, "the email task should exist").to.be.ok;
    for(const tab of tabs){
      const {text} = await request(this.server).get(`/ui/tasks/${task!.task_id}${tab}`).expect(401);
      expect(text).not.to.include("payload");
      expect(text).not.to.include("owner@example.com");
    }
  });

  describe("pages", function(){
    const page = async (server: any, path: string, lang?: string)=>{
      const {text} = await request(server).get(`${path}${lang ? `?lang=${lang}` : ""}`)
        .set("Authorization", await bearer("owner"))
        .expect(200);
      return text;
    };
    /** A task that failed, as a task handler fails */
    const failedTask = async (reason: Error = new Error("Task failed"), params: {parent?: number} = {})=>{
      const {task_id} = await taskScheduler.create({type: "testTask", status: "running", data: {secret}, user_id: owner, ...params});
      await taskScheduler.errorTask(task_id, reason);
      return task_id;
    };
    const log = (task_id: number, severity: string, message: string)=>
      taskScheduler.db.run(`INSERT INTO tasks_logs(fk_task_id, severity, message) VALUES ($1, $2, $3)`, [task_id, severity, message]);

    it("have the task's number as their title, over a sidebar to each of them", async function(){
      const {task_id} = await createTask();
      for(const tab of tabs){
        const text = await page(this.server, `/ui/tasks/${task_id}${tab}`);
        expect(text).to.include(`<h1 class="grid-header">Task #${task_id}</h1>`);
        for(const other of tabs){
          expect(text, `link to ${other || "the overview"} from ${tab || "the overview"}`)
            .to.include(`<a class="nav-link${other === tab ? " active" : ""}" href="/ui/tasks/${task_id}${other}">`);
        }
      }
    });

    describe("overview", function(){
      it("starts with what the task is, and its status in the corner", async function(){
        const scene_id = await vfs.createScene("the-scene", owner);
        const {task_id} = await taskScheduler.create({type: "testTask", status: "success", data: {secret}, user_id: owner, scene_id});
        const text = await page(this.server, `/ui/tasks/${task_id}`);
        expect(text).to.match(new RegExp(
          `<header class="task-overview-header">`
          +`\\s*<h2>\\s*testTask\\s*on <a href="/ui/scenes/the-scene">the-scene</a>\\s*</h2>`
          +`\\s*<span class="task-status task-status-large status-success">Success</span>\\s*</header>`
        ));
        expect(text).not.to.include(secret);
      });

      it("says who made it and when on a second line", async function(){
        const {task_id} = await createTask();
        const text = await page(this.server, `/ui/tasks/${task_id}`);
        expect(text).to.match(new RegExp(`</header>\\s*<p class="task-overview-byline">\\s*<span>\\s*<span>Created by\\s*<a href="/ui/users/${owner}/tasks">owner</a></span>\\s*</span>\\s*<time datetime="\\d{4}-[^"]+Z">[^<]+</time>\\s*</p>`));
      });

      it("links who made it to their tasks for an admin, not for others", async function(){
        const scene_id = await vfs.createScene("byline-scene", owner);
        await userManager.grant(scene_id, "other", "read");
        const {task_id} = await createTask({user_id: owner, scene_id});
        const as = async (username: string)=> (await request(this.server).get(`/ui/tasks/${task_id}`).set("Authorization", await bearer(username)).expect(200)).text;
        expect(await as("admin")).to.match(new RegExp(`<span>Created by\\s*<a href="/ui/users/${owner}/tasks">owner</a></span>`));
        const other = await as("other");
        expect(other).to.match(/<span>Created by\s*owner<\/span>/);
        expect(other).not.to.include(`href="/ui/users/${owner}/tasks"`);
      });

      it("says when, without anyone who made it", async function(){
        const {task_id} = await createTask({user_id: null});
        const text = (await request(this.server).get(`/ui/tasks/${task_id}`).set("Authorization", await bearer("admin")).expect(200)).text;
        expect(text).to.match(/<p class="task-overview-byline">\s*<span>\s*<\/span>\s*<time /);
      });

      it("says why it failed, in the language of the page, after that, with a link to the whole error", async function(){
        const task_id = await failedTask(new BadRequestError());
        const english = await page(this.server, `/ui/tasks/${task_id}`);
        expect(english).to.include(`<span class="task-status task-status-large status-error">Error</span>`);
        expect(english).to.match(/<p class="task-overview-byline">.*?<\/p>\s*<section>\s*<h3>Error<\/h3>\s*<p class="task-overview-reason text-error">Bad Request<\/p>/s);
        expect(english).to.include(`href="/ui/tasks/${task_id}/data#output"`);
        const french = await page(this.server, `/ui/tasks/${task_id}`, "fr");
        expect(french).to.include(`<span class="task-status task-status-large status-error">Erreur</span>`);
        expect(french).to.match(/<span>Créée par\s*<a [^>]*>owner<\/a><\/span>/);
        expect(french).to.include(`<p class="task-overview-reason text-error">Requête incorrecte</p>`);
      });

      it("shows the scene it made, as scenes are shown elsewhere", async function(){
        const scene_id = await vfs.createScene("made-by-a-task", owner);
        const {task_id} = await taskScheduler.create({type: "createSceneFromFiles", status: "running", data: {}, user_id: owner});
        await taskScheduler.releaseTask(task_id, scene_id);
        const text = await page(this.server, `/ui/tasks/${task_id}`);
        expect(text).to.include(`<h3 id="task-scenes-heading">Created scenes</h3>`);
        //As search results show them
        expect(text).to.match(new RegExp(`<div class="list-items">\\s*<div id="scene-${scene_id}" class="scene-card">`));
        expect(text).to.include(`href="/ui/scenes/made-by-a-task/view"`);
        expect(text).to.include(`href="/ui/scenes/made-by-a-task/edit"`);
      });

      it("doesn't show scenes when it made none", async function(){
        const {task_id} = await createTask();
        expect(await page(this.server, `/ui/tasks/${task_id}`)).not.to.include("task-scenes-heading");
      });

      it("counts warnings, in the language of the page, with a link to the logs", async function(){
        const {task_id} = await createTask();
        await log(task_id, "info", "fine");
        await log(task_id, "warn", "careful");
        const one = await page(this.server, `/ui/tasks/${task_id}`);
        expect(one).to.include(`<a class="warn-count" href="/ui/tasks/${task_id}/logs">1 warning</a>`);
        await log(task_id, "error", "worse");
        expect(await page(this.server, `/ui/tasks/${task_id}`)).to.include(`>2 warnings</a>`);
        expect(await page(this.server, `/ui/tasks/${task_id}`, "fr")).to.include(`>2 avertissements</a>`);
      });

      it("doesn't count warnings when there are none", async function(){
        const {task_id} = await createTask();
        await log(task_id, "info", "fine");
        expect(await page(this.server, `/ui/tasks/${task_id}`)).not.to.include("warn-count");
      });

      it("links to its parent", async function(){
        const scene_id = await vfs.createScene("scene-of-a-task", owner);
        const {task_id: parent} = await createTask();
        const {task_id} = await taskScheduler.create({type: "testTask", status: "success", data: {}, user_id: owner, scene_id, parent});
        const text = await page(this.server, `/ui/tasks/${task_id}`);
        expect(text).to.include(`<a href="/ui/tasks/${parent}">#${parent}</a>`);
      });

      it("lists what's under it as lists of tasks do, with why they failed", async function(){
        const {task_id} = await createTask();
        const child = await failedTask(new Error("Child failed"), {parent: task_id});
        const text = await page(this.server, `/ui/tasks/${task_id}`);
        expect(text).to.include(`<h3 id="task-subtasks-heading">Subtasks</h3>`);
        expect(text).to.include(`<a class="task-row-type" href="/ui/tasks/${child}">testTask</a>`);
        expect(text).to.include(`<span class="task-row-reason text-error">Child failed</span>`);
        expect(text).to.include(`<a class="task-row-owner" href="/ui/users/${owner}/tasks">owner</a>`);
      });

      it("has what's under it in sight, all the way down", async function(){
        const {task_id} = await createTask();
        const {task_id: child} = await taskScheduler.create({type: "testTask", status: "success", data: {}, user_id: owner, parent: task_id});
        const {task_id: grandchild} = await taskScheduler.create({type: "testTask", status: "success", data: {}, user_id: owner, parent: child});
        await taskScheduler.create({type: "testTask", status: "success", data: {}, user_id: owner, parent: grandchild});
        const text = await page(this.server, `/ui/tasks/${task_id}`);
        expect(text.match(/<details open>/g)).to.have.length(2);
        expect(text).not.to.match(/<details>/);
      });
    });

    describe("logs", function(){
      it("are between what the task was given and what came out of it, each on one line with a link to the whole", async function(){
        const {task_id} = await taskScheduler.create({type: "testTask", status: "running", data: {secret}, user_id: owner});
        await log(task_id, "info", "working on it");
        await taskScheduler.releaseTask(task_id, {made: "something"});
        const text = await page(this.server, `/ui/tasks/${task_id}/logs`);
        const input = text.indexOf(`<td class="log-level">input</td>`);
        const line = text.indexOf("working on it");
        const output = text.indexOf(`<td class="log-level">output</td>`);
        expect(input, "input").to.be.above(-1);
        expect(line, "log line").to.be.above(input);
        expect(output, "output").to.be.above(line);
        expect(text).to.include(`<span class="log-data-line">{&quot;secret&quot;:&quot;${secret}&quot;}</span> <a href="/ui/tasks/${task_id}/data#input">`);
        expect(text).to.include(`<span class="log-data-line">{&quot;made&quot;:&quot;something&quot;}</span> <a href="/ui/tasks/${task_id}/data#output">`);
      });

      it("end with why the task failed", async function(){
        const task_id = await failedTask(new BadRequestError());
        const text = await page(this.server, `/ui/tasks/${task_id}/logs`, "fr");
        expect(text).to.include(`<tr class="log-data log-output log-error">`);
        expect(text).to.include(`<span class="log-data-line">Requête incorrecte</span>`);
      });

      it("have no output line while there's no output", async function(){
        const {task_id} = await taskScheduler.create({type: "testTask", status: "running", data: {}, user_id: owner});
        const text = await page(this.server, `/ui/tasks/${task_id}/logs`);
        expect(text).to.include(`<td class="log-level">input</td>`);
        expect(text).not.to.include(`<td class="log-level">output</td>`);
      });

      it("cut data that's too long for a line", async function(){
        const {task_id} = await taskScheduler.create({type: "testTask", status: "success", data: {long: "x".repeat(500)}, user_id: owner});
        const text = await page(this.server, `/ui/tasks/${task_id}/logs`);
        expect(text).to.match(/<span class="log-data-line">\{&quot;long&quot;:&quot;x+…<\/span>/);
        expect(text).not.to.include("x".repeat(300));
      });

      it("can be filtered by level", async function(){
        const {task_id} = await createTask();
        await log(task_id, "info", "fine");
        await log(task_id, "warn", "careful");
        const text = await page(this.server, `/ui/tasks/${task_id}/logs?level=warn`);
        expect(text).to.include("careful");
        expect(text).not.to.include(">fine<");
      });
    });

    describe("data", function(){
      /** A block of data, and whether it starts with its first lines only */
      const blockOf = (text: string, id: "input"|"output")=>{
        const section = text.match(new RegExp(`<section id="${id}".*?</section>`, "s"))?.[0];
        expect(section, id).to.be.a("string");
        return section!;
      };

      it("shows what the task was given, under a third-level title, with a way to download its workspace", async function(){
        const {task_id} = await createTask();
        const text = await page(this.server, `/ui/tasks/${task_id}/data`);
        const input = blockOf(text, "input");
        expect(input).to.include(`<h3 id="task-input-heading">Input data</h3>`);
        expect(input).to.include(`&quot;secret&quot;: &quot;${secret}&quot;`);
        expect(text).to.include(`href="/tasks/${task_id}/artifact" download="task-${task_id}.zip"`);
      });

      it("shows what came out of it, under a third-level title", async function(){
        const {task_id} = await taskScheduler.create({type: "testTask", status: "running", data: {}, user_id: owner});
        await taskScheduler.releaseTask(task_id, {made: "something"});
        const output = blockOf(await page(this.server, `/ui/tasks/${task_id}/data`), "output");
        expect(output).to.include(`<h3 id="task-output-heading">Output data</h3>`);
        expect(output).to.include(`&quot;made&quot;: &quot;something&quot;`);
      });

      it("shows the whole error of a task that failed", async function(){
        const task_id = await failedTask(new Error("Task failed"));
        const output = blockOf(await page(this.server, `/ui/tasks/${task_id}/data`), "output");
        expect(output).to.match(/<h3 id="task-output-heading" class="text-error">Error<\/h3>\s*<div class="task-data-block[^"]*">\s*<pre class="task-data-box">Error: Task failed\n\s+at /);
      });

      it("says when there's no output", async function(){
        const {task_id} = await taskScheduler.create({type: "testTask", status: "running", data: {}, user_id: owner});
        const output = blockOf(await page(this.server, `/ui/tasks/${task_id}/data`), "output");
        expect(output).to.match(/<h3 id="task-output-heading">Output data<\/h3>\s*<p>No output data.<\/p>/);
        const french = blockOf(await page(this.server, `/ui/tasks/${task_id}/data`, "fr"), "output");
        expect(french).to.include(`<p>Aucune donnée de sortie.</p>`);
      });

      it("starts with the first lines of what's long, with a way to show all of it", async function(){
        const data = Object.fromEntries(Array.from({length: 20}, (_, i)=> [`key${i}`, i]));
        const {task_id} = await taskScheduler.create({type: "testTask", status: "running", data, user_id: owner});
        await taskScheduler.releaseTask(task_id, data);
        const text = await page(this.server, `/ui/tasks/${task_id}/data`);
        for(const id of ["input", "output"] as const){
          const block = blockOf(text, id);
          expect(block, id).to.include(`<div class="task-data-block task-data-long">`);
          //All of it is there, for the browser to show
          expect(block, id).to.include(`&quot;key19&quot;: 19`);
          expect(block, id).to.match(/<label class="task-data-toggle">\s*<input type="checkbox" class="visually-hidden">\s*<span class="task-data-show-all">Show all<\/span>\s*<span class="task-data-show-less">Show less<\/span>\s*<\/label>/);
        }
      });

      it("shows what's short as it is", async function(){
        const {task_id} = await createTask();
        const input = blockOf(await page(this.server, `/ui/tasks/${task_id}/data`), "input");
        expect(input).to.include(`<div class="task-data-block">`);
        expect(input).not.to.include("task-data-toggle");
      });
    });
  });
});
