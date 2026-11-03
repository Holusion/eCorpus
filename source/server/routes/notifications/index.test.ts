import fs from "node:fs/promises";
import http from "node:http";
import { AddressInfo } from "node:net";
import path from "node:path";
import timers from "node:timers/promises";

import request from "supertest";

import { fixturesDir } from "../../__test_fixtures/fixtures.js";
import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import { AppLocals } from "../../utils/locals.js";
import Vfs from "../../vfs/index.js";


describe("Notifications", function(){
  let locals: AppLocals, vfs: Vfs, userManager: UserManager, tasks: TaskScheduler;
  let user: User, other: User;

  /** Gives up eventually: a loop outliving its failed test would keep mocha from exiting */
  async function until(condition: ()=>unknown){
    const deadline = Date.now() + 5000;
    while(!await condition()){
      if(deadline < Date.now()) throw new Error(`Timeout waiting for: ${condition}`);
      await timers.setTimeout(2);
    }
  }

  /** A task that ends up in that user's inbox */
  async function notifiedTask(params: {user_id?: number, type?: string, scene_id?: number|null, fail?: boolean, data?: Record<string, any>} = {}){
    const {user_id = user.uid, type = "testTask", scene_id = null, fail = false, data = {}} = params;
    const task = await tasks.create({type, data, user_id, scene_id, notify: true, status: "running"});
    if(fail) await tasks.errorTask(task.task_id, new Error("Task failed"));
    else await tasks.releaseTask(task.task_id, {});
    return task;
  }

  /** A notification that has nothing to do with tasks */
  async function addNotification(user_id: number, type: string, scene_id: number|null = null){
    const row = await tasks.db.get<{notification_id: number}>(`
      INSERT INTO notifications(fk_user_id, type, fk_scene_id) VALUES ($1, $2, $3) RETURNING notification_id
    `, [user_id, type, scene_id]);
    return row!.notification_id;
  }

  this.beforeAll(async function(){
    locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    tasks = locals.taskScheduler;
  });

  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    user = await userManager.addUser("bob", "12345678", "create", "bob@example.com");
    other = await userManager.addUser("charlie", "12345678", "create");
    await userManager.addUser("alice", "12345678", "admin");
  });


  describe("GET /notifications", function(){
    it("requires a logged-in user", async function(){
      await request(this.server).get("/notifications").expect(401);
    });

    it("needs account:read on a token", async function(){
      await request(this.server).get("/notifications").set("Authorization", await bearer("bob", ["tasks:read"])).expect(403);
      await request(this.server).get("/notifications").set("Authorization", await bearer("bob", ["account:read"])).expect(200);
    });

    it("is empty to begin with", async function(){
      const {body} = await request(this.server).get("/notifications").set("Authorization", await bearer("bob")).expect(200);
      expect(body).to.deep.equal([]);
    });

    it("describes a task's notification", async function(){
      const task = await notifiedTask({type: "someTask"});
      const {body, headers} = await request(this.server).get("/notifications")
        .set("Authorization", await bearer("bob"))
        .set("Accept-Language", "en")
        .expect(200);
      expect(headers["cache-control"]).to.include("private");
      expect(body).to.have.length(1);
      expect(body[0]).to.have.all.keys("notification_id", "type", "ctime", "read_at", "message", "link", "task", "scene");
      expect(body[0]).to.deep.include({
        type: "task",
        read_at: null,
        message: "Task someTask has finished",
        link: `/ui/tasks/${task.task_id}`,
        task: {task_id: task.task_id, type: "someTask", status: "success"},
        scene: null,
      });
    });

    it("only has the requester's notifications, even for an admin", async function(){
      await notifiedTask({user_id: other.uid});
      const mine = await notifiedTask();
      for(const [name, expected] of [["bob", [mine.task_id]], ["alice", []]] as const){
        const {body} = await request(this.server).get("/notifications").set("Authorization", await bearer(name)).expect(200);
        expect(body.map((n: any)=> n.task.task_id)).to.deep.equal(expected);
      }
    });

    it("lists the newest first", async function(){
      const a = await notifiedTask(), b = await notifiedTask(), c = await notifiedTask();
      const {body} = await request(this.server).get("/notifications").set("Authorization", await bearer("bob")).expect(200);
      expect(body.map((n: any)=> n.task.task_id)).to.deep.equal([c.task_id, b.task_id, a.task_id]);
    });

    it("only lists unread ones, unless asked otherwise", async function(){
      const read = await addNotification(user.uid, "a");
      const unread = await addNotification(user.uid, "b");
      await userManager.markNotificationsRead(user.uid, {ids: [read]});
      const Authorization = await bearer("bob");

      const unreadOnly = await request(this.server).get("/notifications").set("Authorization", Authorization).expect(200);
      expect(unreadOnly.body.map((n: any)=> n.notification_id)).to.deep.equal([unread]);

      const all = await request(this.server).get("/notifications").query({status: "all"}).set("Authorization", Authorization).expect(200);
      expect(all.body.map((n: any)=> n.notification_id)).to.deep.equal([unread, read]);
      expect(all.body[1].read_at).to.be.a("string");
    });

    it("pages through results", async function(){
      const ids = [];
      for(let i = 0; i < 3; i++) ids.push(await addNotification(user.uid, "a"));
      const {body} = await request(this.server).get("/notifications").query({limit: 1, offset: 1}).set("Authorization", await bearer("bob")).expect(200);
      expect(body.map((n: any)=> n.notification_id)).to.deep.equal([ids[1]]);
    });

    for(const query of [{status: "foo"}, {limit: 0}, {limit: 101}, {limit: "foo"}, {offset: -1}]){
      it(`rejects ${JSON.stringify(query)}`, async function(){
        await request(this.server).get("/notifications").query(query).set("Authorization", await bearer("bob")).expect(400);
      });
    }

    describe("messages", function(){
      async function messageOf(server: any, lang: string){
        const {body} = await request(server).get("/notifications").set("Authorization", await bearer("bob")).set("Accept-Language", lang).expect(200);
        return body[0].message;
      }

      it("are specific to a task's type and status", async function(){
        await notifiedTask({type: "extractScenesArchives"});
        expect(await messageOf(this.server, "en")).to.equal("Archive import has finished");
        await notifiedTask({type: "extractScenesArchives", fail: true});
        expect(await messageOf(this.server, "en")).to.equal("Archive import has failed");
      });

      it("name the task's scene", async function(){
        const scene_id = await vfs.createScene("foo", user.uid);
        await notifiedTask({type: "createSceneFromFiles", scene_id});
        expect(await messageOf(this.server, "en")).to.equal("Scene foo is ready");
      });

      it("name a scene that doesn't exist, for a task that failed to create it", async function(){
        await notifiedTask({type: "postScene", fail: true, data: {scene: "foo"}});
        expect(await messageOf(this.server, "en")).to.equal("Creation of scene foo has failed");
        expect(await messageOf(this.server, "fr")).to.equal("La création de la scène foo a échoué");
        await notifiedTask({type: "createSceneFromFiles", fail: true, data: {name: "bar"}});
        expect(await messageOf(this.server, "en")).to.equal("Creation of scene bar has failed");
      });

      it("prefer the current name of a scene that exists", async function(){
        const scene_id = await vfs.createScene("current", user.uid);
        await notifiedTask({type: "createSceneFromFiles", scene_id, data: {name: "former"}});
        expect(await messageOf(this.server, "en")).to.equal("Scene current is ready");
      });

      it("still make sense without a scene to name", async function(){
        await notifiedTask({type: "postScene", fail: true});
        expect(await messageOf(this.server, "en")).to.equal("Creation of scene ? has failed");
      });

      it("don't list a scene that doesn't exist as the notification's scene", async function(){
        await notifiedTask({type: "postScene", fail: true, data: {scene: "foo"}});
        const {body} = await request(this.server).get("/notifications").set("Authorization", await bearer("bob")).expect(200);
        expect(body[0].scene).to.equal(null);
        expect(body[0]).not.to.have.property("requested_scene");
      });

      it("are translated", async function(){
        await notifiedTask({type: "extractScenesArchives"});
        expect(await messageOf(this.server, "fr")).to.equal("L'import de l'archive est terminé");
      });

      it("exist for a task type nobody wrote one for", async function(){
        await notifiedTask({type: "brandNewTask", fail: true});
        expect(await messageOf(this.server, "en")).to.equal("Task brandNewTask has failed");
        expect(await messageOf(this.server, "fr")).to.equal("La tâche brandNewTask a échoué");
      });

      it("exist for any other kind of notification", async function(){
        await addNotification(user.uid, "brand_new_kind");
        expect(await messageOf(this.server, "en")).to.equal("You have a new notification");
        expect(await messageOf(this.server, "fr")).to.equal("Vous avez une nouvelle notification");
      });
    });

    it("works for a kind of notification that isn't about a task", async function(){
      const scene_id = await vfs.createScene("foo", user.uid);
      const id = await addNotification(user.uid, "scene_shared", scene_id);
      const {body} = await request(this.server).get("/notifications").set("Authorization", await bearer("bob")).expect(200);
      expect(body[0]).to.deep.include({notification_id: id, type: "scene_shared", task: null, link: null, scene: "foo"});
    });
  });


  describe("POST /notifications/read", function(){
    const unread = (uid: number)=> userManager.countUnreadNotifications(uid);

    it("requires a logged-in user", async function(){
      await request(this.server).post("/notifications/read").send({up_to: 1}).expect(401);
    });

    it("needs account:write on a token", async function(){
      await request(this.server).post("/notifications/read").send({up_to: 1}).set("Authorization", await bearer("bob", ["account:read"])).expect(403);
      await request(this.server).post("/notifications/read").send({up_to: 1}).set("Authorization", await bearer("bob", ["account:write"])).expect(200);
    });

    it("marks a list of notifications", async function(){
      const a = await addNotification(user.uid, "a"), b = await addNotification(user.uid, "a");
      await addNotification(user.uid, "a");
      const {body} = await request(this.server).post("/notifications/read").send({ids: [a, b]}).set("Authorization", await bearer("bob")).expect(200);
      expect(body).to.deep.equal({read: 2});
      expect(await unread(user.uid)).to.equal(1);
    });

    it("marks everything up to an ID, and not what came after", async function(){
      await addNotification(user.uid, "a");
      const upTo = await addNotification(user.uid, "a");
      const later = await addNotification(user.uid, "a");
      const {body} = await request(this.server).post("/notifications/read").send({up_to: upTo}).set("Authorization", await bearer("bob")).expect(200);
      expect(body).to.deep.equal({read: 2});
      const left = await userManager.getNotifications(user.uid);
      expect(left.map(n=> n.notification_id)).to.deep.equal([later]);
    });

    it("can't touch the notifications of someone else", async function(){
      const theirs = await addNotification(other.uid, "a");
      const Authorization = await bearer("bob");
      expect((await request(this.server).post("/notifications/read").send({ids: [theirs]}).set("Authorization", Authorization).expect(200)).body).to.deep.equal({read: 0});
      expect((await request(this.server).post("/notifications/read").send({up_to: theirs}).set("Authorization", Authorization).expect(200)).body).to.deep.equal({read: 0});
      const admin = await bearer("alice");
      expect((await request(this.server).post("/notifications/read").send({ids: [theirs]}).set("Authorization", admin).expect(200)).body).to.deep.equal({read: 0});
      expect(await unread(other.uid)).to.equal(1);
    });

    it("can be repeated, keeping the first time it was read", async function(){
      const id = await addNotification(user.uid, "a");
      const Authorization = await bearer("bob");
      await request(this.server).post("/notifications/read").send({ids: [id]}).set("Authorization", Authorization).expect(200);
      const [first] = await userManager.getNotifications(user.uid, {unreadOnly: false});
      await timers.setTimeout(5);
      const {body} = await request(this.server).post("/notifications/read").send({ids: [id]}).set("Authorization", Authorization).expect(200);
      expect(body).to.deep.equal({read: 0});
      const [second] = await userManager.getNotifications(user.uid, {unreadOnly: false});
      expect(second.read_at).to.deep.equal(first.read_at);
    });

    for(const payload of [{}, {ids: [1], up_to: 1}, {ids: "1"}, {ids: ["1"]}, {ids: [1.5]}, {ids: [-1]}, {ids: [Number.MAX_VALUE]}, {up_to: "1"}, {up_to: 0}, {ids: new Array(1001).fill(1)}]){
      it(`rejects ${JSON.stringify(payload).slice(0, 40)}`, async function(){
        await request(this.server).post("/notifications/read").send(payload).set("Authorization", await bearer("bob")).expect(400);
      });
    }

    it("rejects cross-site requests from a session", async function(){
      const login = await request(this.server).post("/auth/login")
        .send({username: "bob", password: "12345678"})
        .set("Content-Type", "application/json")
        .set("Accept", "")
        .expect(200);
      const cookie = (login.headers["set-cookie"] as unknown as string[]).map(c=> c.split(";")[0]).join("; ");
      await request(this.server).post("/notifications/read").send({up_to: 1}).set("Cookie", cookie).set("Sec-Fetch-Site", "cross-site").expect(403);
    });
  });


  describe("lifetime", function(){
    it("goes away with its task", async function(){
      const task = await notifiedTask();
      await tasks.deleteTask(task.task_id);
      expect(await userManager.getNotifications(user.uid)).to.deep.equal([]);
    });

    it("goes away with its owner", async function(){
      await notifiedTask({user_id: other.uid});
      await tasks.db.run(`DELETE FROM users WHERE user_id = $1`, [other.uid]);
      expect((await tasks.db.get(`SELECT COUNT(*) AS count FROM notifications`))!.count).to.equal(0);
    });
  });


  describe("what routes ask for", function(){
    const stateOf = async (type: string)=> (await tasks.db.all<{notify: string}>(`SELECT notify FROM tasks WHERE type = $1`, [type])).map(t=> t.notify);

    it("POST /tasks: nothing for a client that got its answer", async function(){
      const {body} = await request(this.server).post("/tasks")
        .set("Authorization", await bearer("bob"))
        .send({type: "cleanOldTasks", data: {}})
        .expect(201);
      expect(await stateOf("cleanOldTasks")).to.deep.equal(["awaited"]);
      await until(async ()=> (await tasks.getTask(body.task_id)).status === "success");
      //The response has to be closed for it to be considered: it's done by the time supertest gets it
      await timers.setTimeout(20);
      expect(await stateOf("cleanOldTasks")).to.deep.equal(["awaited"]);
      expect(await userManager.getNotifications(user.uid)).to.deep.equal([]);
    });

    it("POST /tasks: an upload being initialized doesn't notify", async function(){
      await request(this.server).post("/tasks")
        .set("Authorization", await bearer("bob"))
        .send({type: "parseUserUpload", status: "initializing", data: {filename: "foo.glb", size: 1}})
        .expect(201);
      expect(await stateOf("parseUserUpload")).to.deep.equal(["no"]);
    });

    it("POST /scenes: notifies a client that left during the import", async function(){
      const server = http.createServer(this.server);
      await new Promise<void>((resolve)=> server.listen(0, "127.0.0.1", resolve));
      const Authorization = await bearer("bob");
      try{
        const req = http.request({
          port: (server.address() as AddressInfo).port,
          path: "/scenes",
          method: "POST",
          headers: {
            Authorization,
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="scenes.zip"`,
            "Content-Length": "1000",
          },
        });
        req.on("error", ()=>{});
        req.write("incomplete");
        await until(async ()=> (await stateOf("handlePostScene")).length);
        expect(await stateOf("handlePostScene")).to.deep.equal(["awaited"]);
        expect(await userManager.getNotifications(user.uid), "it's still waiting").to.deep.equal([]);

        req.destroy();

        await until(async ()=> (await userManager.getNotifications(user.uid)).length);
        const [notification] = await userManager.getNotifications(user.uid);
        expect(notification.task).to.include({type: "handlePostScene", status: "error"});
      }finally{
        server.closeAllConnections();
        await new Promise((resolve)=> server.close(resolve));
      }
    });

    it("POST /scenes/:scene: nothing for a client that got its answer", async function(){
      await request(this.server).post("/scenes/foo")
        .set("Authorization", await bearer("bob"))
        .send(await fs.readFile(path.join(fixturesDir, "cube.glb")))
        .expect(201);
      expect(await stateOf("postScene")).to.deep.equal(["awaited"]);
      await timers.setTimeout(20);
      expect(await stateOf("postScene")).to.deep.equal(["awaited"]);
      expect(await userManager.getNotifications(user.uid)).to.deep.equal([]);
    });

    it("POST /scenes/:scene: attaches the task to the scene once it's complete", async function(){
      await request(this.server).post("/scenes/foo")
        .set("Authorization", await bearer("bob"))
        .send(await fs.readFile(path.join(fixturesDir, "cube.glb")))
        .expect(201);
      const scene_id = await vfs.getSceneId("foo");
      const [task] = await tasks.getTasks({scene_id, type: "postScene"});
      expect(task, "the scene's task").to.be.ok;
      expect(task.status).to.equal("success");
    });

    it("POST /scenes/:scene: keeps the record of a failure, for a client that got its answer", async function(){
      await request(this.server).post("/scenes/foo")
        .set("Authorization", await bearer("bob"))
        .set("Content-Type", "application/octet-stream")
        .send("not a model")
        .expect((res)=> expect(res.status).to.be.at.least(400));
      await expect(vfs.getSceneId("foo"), "the scene is removed").to.be.rejected;

      const [task] = await tasks.getTasks({user_id: user.uid, type: "postScene"});
      expect(task.status).to.equal("error");
      expect(task.scene_id).to.equal(null);
      expect(await tasks.getLogs(task.task_id), "its logs are still there").to.have.property("length").above(0);
      expect(await userManager.getNotifications(user.uid), "the response said it all").to.deep.equal([]);

      //And doesn't get in the way of trying again
      await request(this.server).post("/scenes/foo")
        .set("Authorization", await bearer("bob"))
        .send(await fs.readFile(path.join(fixturesDir, "cube.glb")))
        .expect(201);
    });

    it("POST /scenes/:scene: notifies a client that left during the upload", async function(){
      const server = http.createServer(this.server);
      await new Promise<void>((resolve)=> server.listen(0, "127.0.0.1", resolve));
      const Authorization = await bearer("bob");
      try{
        const req = http.request({
          port: (server.address() as AddressInfo).port,
          path: "/scenes/foo",
          method: "POST",
          headers: {
            Authorization,
            "Content-Type": "application/octet-stream",
            "Content-Length": "1000",
          },
        });
        req.on("error", ()=>{});
        req.write("incomplete");
        await until(async ()=> (await stateOf("postScene")).length);
        expect(await stateOf("postScene")).to.deep.equal(["awaited"]);

        req.destroy();

        await until(async ()=> (await userManager.getNotifications(user.uid)).length);
        await until(async ()=>{
          try{ await vfs.getSceneId("foo"); return false; }catch(e){ return true; }
        });

        //The scene went away, and everything we need to report on it stayed
        const {body} = await request(this.server).get("/notifications")
          .set("Authorization", Authorization)
          .set("Accept-Language", "en")
          .expect(200);
        expect(body).to.have.length(1);
        expect(body[0].message).to.equal("Creation of scene foo has failed");
        expect(body[0].task).to.include({type: "postScene", status: "error"});
        expect(body[0].scene).to.equal(null);
        await request(this.server).get(body[0].link).set("Authorization", Authorization).expect(200);
      }finally{
        server.closeAllConnections();
        await new Promise((resolve)=> server.close(resolve));
      }
    });

    it("POST /scenes/:scene: its child tasks don't notify", async function(){
      await request(this.server).post("/scenes/foo")
        .set("Authorization", await bearer("bob"))
        .send(await fs.readFile(path.join(fixturesDir, "cube.glb")))
        .expect(201);
      const rows = await tasks.db.all(`SELECT type FROM tasks WHERE parent IS NOT NULL AND notify <> 'no'`);
      expect(rows).to.deep.equal([]);
    });

    it("a login link doesn't notify", async function(){
      //As an admin: anonymous requests are limited per IP, and that limit is shared with other tests
      await request(this.server).post("/auth/login/bob/link").set("Authorization", await bearer("alice")).expect(204);
      await until(async ()=> (await stateOf("sendEmail")).length);
      expect(await stateOf("sendEmail")).to.deep.equal(["no"]);
    });

    it("a welcome email doesn't notify", async function(){
      await request(this.server).post("/users")
        .set("Authorization", await bearer("alice"))
        .set("Content-Type", "application/json")
        .send({username: "dave", password: "12345678", email: "dave@example.com", level: "create", send_onboarding: true})
        .expect(201);
      await until(async ()=> (await stateOf("sendEmail")).length);
      expect(await stateOf("sendEmail")).to.deep.equal(["no"]);
    });
  });
});
