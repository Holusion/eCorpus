import http from "node:http";
import { AddressInfo } from "node:net";
import timers from "node:timers/promises";

import request from "supertest";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { NotificationManager } from "../../notifications/manager.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import { NotificationItem } from "../../notifications/types.js";
import { Activity } from "./activity.js";
import { AppLocals } from "../../utils/locals.js";


/** A real connection to the server: those responses don't end, which supertest can't do. */
class TestStream{
  status = 0;
  headers: http.IncomingHttpHeaders = {};
  body = "";
  ended = false;
  private req!: http.ClientRequest;

  /** Resolves once response headers are received */
  connected!: Promise<void>;

  constructor(port: number, path: string, headers: Record<string, string> = {}, method = "GET"){
    this.connected = new Promise((resolve, reject)=>{
      this.req = http.request({port, path, headers: {Accept: "text/event-stream", ...headers}, method, agent: false}, (res)=>{
        this.status = res.statusCode!;
        this.headers = res.headers;
        res.setEncoding("utf8");
        res.on("data", (d)=> this.body += d);
        res.on("close", ()=>{ this.ended = true; });
        resolve();
      });
      this.req.on("error", (e)=> {
        this.ended = true;
        reject(e);
      });
      this.req.end();
    });
  }

  /** Complete frames received so far */
  get frames(): string[]{
    return this.body.split("\n\n").slice(0, -1);
  }

  /** Events received so far, after the state */
  get events(): Array<{event: string, data: any}>{
    return this.frames.filter(f=> f.startsWith("event: ")).map(f=>{
      const [, event, data] = /^event: ([^\n]+)\ndata: ([^\n]+)$/.exec(f)!;
      return {event, data: JSON.parse(data)};
    });
  }

  get state(): Activity|undefined{
    return this.events.find(e=> e.event === "state")?.data;
  }

  /** Changes received after the state */
  get changes(){
    return this.events.filter(e=> e.event !== "state");
  }

  close(){
    this.req.destroy();
  }
}


describe("GET /users/:uid/activity", function(){
  let locals: AppLocals, userManager: UserManager, tasks: TaskScheduler, hub: NotificationManager;
  let user: User, other: User, admin: User;
  let server: http.Server, port: number;
  let streams: TestStream[] = [];
  let restore: Array<()=>void> = [];

  /** Gives up eventually: a loop outliving its failed test would keep mocha from exiting */
  async function until(condition: ()=>unknown){
    const deadline = Date.now() + 5000;
    while(!await condition()){
      if(deadline < Date.now()) throw new Error(`Timeout waiting for: ${condition}`);
      await timers.setTimeout(2);
    }
  }

  function open(path: string, headers: Record<string, string> = {}, method = "GET"){
    const stream = new TestStream(port, path, headers, method);
    streams.push(stream);
    return stream;
  }

  /** Opens a stream as this user, and waits for its state */
  async function connect(path: string, as: string = "bob"){
    const stream = open(path, {Authorization: await bearer(as)});
    await stream.connected;
    expect(stream.status, stream.body).to.equal(200);
    await until(()=> stream.state);
    return stream;
  }

  /** Replaces a method for the duration of the test */
  function stub<T extends object, K extends keyof T>(target: T, name: K, replacement: T[K]){
    const original = target[name];
    (target as any)[name] = replacement;
    restore.push(()=>{ delete (target as any)[name]; if(target[name] !== original) (target as any)[name] = original; });
  }

  const terminateHub = ()=> tasks.db.run(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'ecorpus:notifications' AND datname = current_database()`);

  this.beforeAll(async function(){
    locals = await createIntegrationContext(this);
    userManager = locals.userManager;
    tasks = locals.taskScheduler;
    hub = locals.notifications;
    await new Promise<void>((resolve)=>{ server = this.server.listen(0, "127.0.0.1", resolve); });
    port = (server.address() as AddressInfo).port;
  });

  this.afterAll(async function(){
    server?.closeAllConnections();
    await new Promise((resolve)=> server ? server.close(resolve) : resolve(undefined));
  });

  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    user = await userManager.addUser("bob", "12345678", "create");
    other = await userManager.addUser("charlie", "12345678", "create");
    admin = await userManager.addUser("alice", "12345678", "admin");
  });

  this.afterEach(async function(){
    for(const undo of restore) undo();
    restore = [];
    for(const stream of streams) stream.close();
    streams = [];
    await until(()=> hub.stats().streams === 0);
  });


  describe("permissions", function(){
    const get = (server: any, path: string, token?: string)=>{
      const r = request(server).get(path);
      if(token) r.set("Authorization", token);
      return r;
    };

    it("rejects anonymous requests", async function(){
      await get(this.server, `/users/${user.uid}/activity`).expect(401);
      await get(this.server, `/users/${user.uid}/activity`).set("Accept", "text/event-stream").expect(401);
    });

    it("is for that user", async function(){
      await get(this.server, `/users/${user.uid}/activity`, await bearer("bob")).expect(200);
      await connect(`/users/${user.uid}/activity`, "bob");
    });

    it("is for admins", async function(){
      await get(this.server, `/users/${user.uid}/activity`, await bearer("alice")).expect(200);
      await connect(`/users/${user.uid}/activity`, "alice");
    });

    it("isn't for other users", async function(){
      await get(this.server, `/users/${user.uid}/activity`, await bearer("charlie")).expect(401);
      await get(this.server, `/users/${user.uid}/activity`, await bearer("charlie")).set("Accept", "text/event-stream").expect(401);
      expect(hub.stats().streams).to.equal(0);
    });

    it("needs tasks:read on a token", async function(){
      await get(this.server, `/users/${user.uid}/activity`, await bearer("bob", ["scenes:read"])).expect(403);
      await get(this.server, `/users/${user.uid}/activity`, await bearer("bob", ["tasks:read"])).expect(200);
    });

    it("won't match anything else than an ID", async function(){
      await get(this.server, "/users/foo/activity", await bearer("alice")).expect(404);
    });
  });


  describe("as JSON", function(){
    async function notificationsOf(this: Mocha.Context, as = "bob", uid = user.uid, query = ""): Promise<NotificationItem[]>{
      const res = await request(this.server).get(`/users/${uid}/activity${query}`)
      .set("Authorization", await bearer(as))
      .expect(200)
      .expect("Content-Type", /^application\/json/);
      expect(Object.keys(res.body)).to.deep.equal(["notifications"]);
      return res.body.notifications;
    }

    it("is the default, and varies with Accept", async function(){
      const res = await request(this.server).get(`/users/${user.uid}/activity`)
      .set("Authorization", await bearer("bob"))
      .expect(200)
      .expect("Content-Type", /^application\/json/);
      expect(res.headers["vary"]).to.match(/\bAccept\b/);
    });

    it("answers 406 to a client that takes neither JSON nor events", async function(){
      await request(this.server).get(`/users/${user.uid}/activity`)
      .set("Authorization", await bearer("bob"))
      .set("Accept", "text/html")
      .expect(406);
    });

    it("is empty for a user who has none", async function(){
      await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      expect(await notificationsOf.call(this)).to.deep.equal([]);
    });

    it("lists the user's notifications, newest first, with their task's status", async function(){
      const settled = await tasks.create({type: "testTask", data: {secret: "secret"}, user_id: user.uid});
      await hub.notify(settled);
      await tasks.releaseTask(settled.task_id, {secret: "secret"});
      const running = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      await hub.notify(running);
      await hub.notify(await tasks.create({type: "foreign", data: {}, user_id: other.uid}));

      const notifications = await notificationsOf.call(this);
      expect(notifications.map(({mtime, notification_id, ...n})=> n)).to.deep.equal([
        {task_id: running.task_id, type: "testTask", status: "pending", read: false},
        {task_id: settled.task_id, type: "testTask", status: "success", read: false},
      ]);
      expect(JSON.stringify(notifications)).not.to.include("secret");
    });

    it("has what changed last first: a task that has just ended, but not one that's just been read", async function(){
      const long = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      await hub.notify(long);
      const short = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      await hub.notify(short);
      await tasks.releaseTask(short.task_id, null);
      await tasks.releaseTask(long.task_id, null);
      //The oldest one: only its mtime can put it first
      const before = await notificationsOf.call(this);
      expect(before.map(n=> n.task_id)).to.deep.equal([long.task_id, short.task_id]);

      await tasks.db.run(`UPDATE notifications SET read = true WHERE fk_task_id = $1`, [short.task_id]);
      const after = await notificationsOf.call(this);
      expect(after.map(n=> n.task_id)).to.deep.equal([long.task_id, short.task_id]);
      expect(after[1].mtime).to.equal(before[1].mtime);
    });

    it("has notifications about tasks that aren't the user's", async function(){
      //eg. admins told about a cleanup phase that failed
      const cleanup = await tasks.create({type: "runCleanup", data: {}});
      const phase = await tasks.create({type: "checkForMissingObjects", data: {}, parent: cleanup.task_id});
      await tasks.db.run(`INSERT INTO notifications(fk_user_id, fk_task_id, type) VALUES ($1, $2, 'cleanup_failed')`, [admin.uid, phase.task_id]);
      await tasks.errorTask(phase.task_id, "Some data has been lost");
      const notifications = await notificationsOf.call(this, "alice", admin.uid);
      expect(notifications.map(({mtime, notification_id, ...n})=> n)).to.deep.equal([
        {task_id: phase.task_id, type: "cleanup_failed", status: "error", read: false},
      ]);
    });

    it("has notifications without a task", async function(){
      await tasks.db.run(`INSERT INTO notifications(fk_user_id, type, data) VALUES ($1, 'scene_shared', '{"scene": "foo"}')`, [user.uid]);
      const notifications = await notificationsOf.call(this);
      expect(notifications.map(({mtime, notification_id, ...n})=> n)).to.deep.equal([
        {task_id: null, type: "scene_shared", status: null, read: false},
      ]);
    });

    describe("limit", function(){
      /** 25 notified tasks, all settled, every other one read. Returns their ids, oldest first */
      async function fill(){
        const ids: number[] = [];
        for(let i = 0; i < 25; i++){
          const t = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
          await hub.notify(t);
          await tasks.releaseTask(t.task_id, null);
          if(i % 2) await tasks.db.run(`UPDATE notifications SET read = true WHERE fk_task_id = $1`, [t.task_id]);
          ids.push(t.task_id);
        }
        return ids;
      }

      it("has the 20 newest by default, read or not", async function(){
        const ids = await fill();
        const notifications = await notificationsOf.call(this);
        expect(notifications.map(n=> n.task_id)).to.deep.equal(ids.slice(-20).reverse());
        expect(notifications[0]).to.include({task_id: ids[24], status: "success", read: false});
        expect(notifications[1]).to.include({task_id: ids[23], status: "success", read: true});
      });

      it("has those still running first, however old", async function(){
        const running = await tasks.create({type: "testTask", data: {}, user_id: user.uid, status: "running"});
        await hub.notify(running);
        const ids = await fill();
        const notifications = await notificationsOf.call(this, "bob", user.uid, "?limit=5");
        expect(notifications.map(n=> n.task_id)).to.deep.equal([running.task_id, ...ids.slice(-4).reverse()]);
        expect(notifications[0]).to.include({status: "running", read: false});
      });

      it("doesn't go over ?limit, even with more still running", async function(){
        const running = [];
        for(let i = 0; i < 6; i++){
          const task = await tasks.create({type: "testTask", data: {}, user_id: user.uid, status: "running"});
          await hub.notify(task);
          running.push(task.task_id);
        }
        await fill();
        const notifications = await notificationsOf.call(this, "bob", user.uid, "?limit=5");
        expect(notifications.map(n=> n.task_id)).to.have.members(running.slice(-5));
      });

      it("lists one still running among the newest only once", async function(){
        const ids = await fill();
        const running = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
        await hub.notify(running);
        const notifications = await notificationsOf.call(this, "bob", user.uid, "?limit=5");
        expect(notifications.map(n=> n.task_id)).to.deep.equal([running.task_id, ...ids.slice(-4).reverse()]);
      });

      it("takes ?limit, for the JSON answer and the stream's state", async function(){
        const ids = await fill();
        const notifications = await notificationsOf.call(this, "bob", user.uid, "?limit=5");
        expect(notifications.map(n=> n.task_id)).to.deep.equal(ids.slice(-5).reverse());
        const stream = await connect(`/users/${user.uid}/activity?limit=5`);
        expect(stream.state).to.deep.equal({notifications});
      });

      for(const limit of ["0", "-1", "101", "foo"]){
        it(`rejects limit=${limit}, without subscribing`, async function(){
          const subscribe = hub.subscribe;
          let subscribed = false;
          stub(hub, "subscribe", async function(...args: any[]){
            subscribed = true;
            return await subscribe.apply(hub, args as any);
          } as any);
          await request(this.server).get(`/users/${user.uid}/activity?limit=${limit}`).set("Authorization", await bearer("bob")).expect(400);
          await request(this.server).get(`/users/${user.uid}/activity?limit=${limit}`).set("Authorization", await bearer("bob")).set("Accept", "text/event-stream").expect(400);
          expect(subscribed).to.be.false;
        });
      }
    });
  });


  describe("as a stream", function(){
    it("is an unbuffered, private event stream", async function(){
      const stream = await connect(`/users/${user.uid}/activity`);
      expect(stream.headers["content-type"]).to.match(/^text\/event-stream/);
      expect(stream.headers["cache-control"]).to.equal("no-cache, no-transform, private");
      expect(stream.headers["x-accel-buffering"]).to.equal("no");
    });

    it("tells clients how long to wait before reconnecting", async function(){
      const stream = await connect(`/users/${user.uid}/activity`);
      expect(stream.frames[0]).to.match(/^retry: \d+$/);
    });

    it("HEAD doesn't hang", async function(){
      const res = await request(this.server).head(`/users/${user.uid}/activity`)
      .set("Authorization", await bearer("bob"))
      .set("Accept", "text/event-stream")
      .expect(200);
      expect(res.headers["content-type"]).to.match(/^text\/event-stream/);
      expect(hub.stats().streams).to.equal(0);
    });

    it("starts with the same list as the JSON answer", async function(){
      await hub.notify(await tasks.create({type: "testTask", data: {}, user_id: user.uid}));
      const {body} = await request(this.server).get(`/users/${user.uid}/activity`).set("Authorization", await bearer("bob")).expect(200);
      const stream = await connect(`/users/${user.uid}/activity`);
      expect(stream.state).to.deep.equal(body);
      expect(stream.state!.notifications).to.have.length(1);
    });

    it("then follows the notification of a task started with Prefer: respond-async", async function(){
      const stream = await connect(`/users/${user.uid}/activity`);
      const res = await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .set("Prefer", "respond-async")
      .send({type: "delayTask", data: {ms: 10}})
      .expect(202);
      expect(res.headers["link"]).to.equal(`</users/${user.uid}/activity>; rel="monitor"`);
      const {task_id} = res.body;

      await until(()=> stream.changes.some(c=> c.data.status === "success"));
      expect(stream.changes.map(c=> c.data.status)).to.deep.equal(["pending", "running", "success"]);
      expect(stream.changes.every(c=> c.event === "notification" && c.data.task_id === task_id && !c.data.read)).to.be.true;
    });

    it("doesn't signal tasks without a notification", async function(){
      const stream = await connect(`/users/${user.uid}/activity`);
      await request(this.server).post("/tasks")
      .set("Authorization", await bearer("bob"))
      .send({type: "delayTask", data: {ms: 0}})
      .expect(200);
      //Signals arrive in commit order: once this one is there, the others would have been too
      const last = await tasks.create({type: "last", data: {}, user_id: user.uid});
      await hub.notify(last);
      await until(()=> stream.changes.length);
      expect(stream.changes.map(c=> c.data.task_id)).to.deep.equal([last.task_id]);
    });

    it("signals marking a notification read", async function(){
      const t = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      await hub.notify(t);
      await tasks.releaseTask(t.task_id, null);
      const stream = await connect(`/users/${user.uid}/activity`);
      await tasks.db.run(`UPDATE notifications SET read = true WHERE fk_task_id = $1`, [t.task_id]);
      await until(()=> stream.changes.length);
      expect(stream.changes[0].data).to.include({task_id: t.task_id, status: "success", read: true});
    });

    it("signals an unread notification going away with its task", async function(){
      const t = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      await hub.notify(t);
      const stream = await connect(`/users/${user.uid}/activity`);
      const [{notification_id}] = stream.state!.notifications;
      await tasks.db.run(`DELETE FROM tasks WHERE task_id = $1`, [t.task_id]);
      await until(()=> stream.changes.length);
      expect(stream.changes).to.deep.equal([{event: "notification", data: {notification_id, deleted: true}}]);
    });

    it("doesn't carry other users' notifications", async function(){
      const stream = await connect(`/users/${user.uid}/activity`);
      await hub.notify(await tasks.create({type: "foreign", data: {}, user_id: other.uid}));
      const last = await tasks.create({type: "last", data: {}, user_id: user.uid});
      await hub.notify(last);
      await until(()=> stream.changes.length);
      expect(stream.changes.map(c=> c.data.task_id)).to.deep.equal([last.task_id]);
    });

    it("holds back changes made while the state was read, until after it", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id: user.uid, status: "running"});
      await hub.notify(task);
      const getNotifications = hub.getNotifications;
      stub(hub, "getNotifications", async function(...args: any[]){
        const stale = await getNotifications.apply(hub, args as any);
        //The state says "running", but it's already over by the time it gets written
        const frames: string[] = [];
        const stop = await hub.subscribe(user.uid, {write: (f: string)=> frames.push(f), end(){}, destroy(){}, writableLength: 0}, {owner: admin.uid});
        await tasks.releaseTask(task.task_id, {});
        await until(()=> frames.length);
        stop();
        return stale;
      } as any);
      const stream = await connect(`/users/${user.uid}/activity`);
      expect(stream.state!.notifications.map(n=> n.status)).to.deep.equal(["running"]);
      await until(()=> stream.changes.length);
      expect(stream.changes.map(c=> c.data.status)).to.deep.equal(["success"]);
      const types = stream.frames.map(f=> /^(event: \w+|retry)/.exec(f)?.[0]);
      expect(types).to.deep.equal(["retry", "event: state", "event: notification"]);
    });
  });


  describe("stream lifecycle", function(){
    it("frees the subscription when the client leaves", async function(){
      const stream = await connect(`/users/${user.uid}/activity`);
      expect(hub.stats().streams).to.equal(1);
      stream.close();
      await until(()=> hub.stats().streams === 0);
    });

    it("frees the subscription of a client that left while it was subscribing", async function(){
      const subscribe = hub.subscribe;
      let called = false, subscribed = false;
      let proceed!: ()=>void;
      const leaving = new Promise<void>((resolve)=>{ proceed = resolve; });
      stub(hub, "subscribe", async function(...args: any[]){
        called = true;
        await leaving;
        const unsubscribe = await subscribe.apply(hub, args as any);
        subscribed = true;
        return unsubscribe;
      } as any);
      const stream = open(`/users/${user.uid}/activity`, {Authorization: await bearer("bob")});
      stream.connected.catch(()=>{}); //It's going to be interrupted
      await until(()=> called);
      stream.close();
      await timers.setTimeout(20); //For the server to see it. It has no way to tell us.
      proceed();
      await until(()=> subscribed);
      await until(()=> hub.stats().streams === 0);
    });

    it("frees the subscription of a client that left while the state was read", async function(){
      const getNotifications = hub.getNotifications;
      let left!: ()=>void;
      const leaving = new Promise<void>((resolve)=>{ left = resolve; });
      stub(hub, "getNotifications", async function(...args: any[]){
        await leaving;
        return await getNotifications.apply(hub, args as any);
      } as any);
      const stream = open(`/users/${user.uid}/activity`, {Authorization: await bearer("bob")});
      await until(()=> hub.stats().streams === 1);
      stream.close();
      await until(()=> hub.stats().streams === 0);
      left();
    });

    it("expires, for permissions to get checked again", async function(){
      this.timeout(5000);
      await locals.config.set("activity_stream_seconds", 1);
      try{
        const stream = await connect(`/users/${user.uid}/activity`);
        await timers.setTimeout(500);
        expect(stream.ended, "at 500ms").to.be.false;
        await until(()=> stream.ended);
        expect(hub.stats().streams).to.equal(0);
      }finally{
        await locals.config.set("activity_stream_seconds", 900);
      }
    });

    it("ignores a lifetime of 0, which would remove the expiry", async function(){
      await locals.config.set("activity_stream_seconds", 0);
      try{
        const stream = await connect(`/users/${user.uid}/activity`);
        await timers.setTimeout(50);
        expect(stream.ended).to.be.false;
      }finally{
        await locals.config.set("activity_stream_seconds", 900);
      }
    });

    it("ends if the database connection is lost, and comes back with the client", async function(){
      const stream = await connect(`/users/${user.uid}/activity`);
      await terminateHub();
      await until(()=> stream.ended);
      const again = await connect(`/users/${user.uid}/activity`);
      await hub.notify(await tasks.create({type: "testTask", data: {}, user_id: user.uid}));
      await until(()=> again.changes.length);
    });
  });


  describe("stream refusals", function(){
    it("refuses a user's streams beyond the limit, without affecting others", async function(){
      const path = `/users/${user.uid}/activity`;
      const opened: TestStream[] = [];
      for(let i = 0; i < 8; i++) opened.push(await connect(path));

      const res = await request(this.server).get(path).set("Authorization", await bearer("bob")).set("Accept", "text/event-stream").expect(429);
      expect(res.headers["retry-after"]).to.equal("30");
      expect(opened.some(s=> s.ended), "existing streams are left alone").to.be.false;
      //JSON doesn't count
      await request(this.server).get(path).set("Authorization", await bearer("bob")).expect(200);

      await connect(`/users/${other.uid}/activity`, "charlie");

      opened[0].close();
      await until(()=> hub.stats().streams === 8);
      await connect(path);
    });

    it("counts them against the requester, whatever they watch", async function(){
      for(let i = 0; i < 8; i++) await connect(`/users/${user.uid}/activity`, "alice");
      await request(this.server).get(`/users/${admin.uid}/activity`).set("Authorization", await bearer("alice")).set("Accept", "text/event-stream").expect(429);
      await connect(`/users/${user.uid}/activity`, "bob");
    });

    it("answers 503 if notifications can't be subscribed to", async function(){
      stub(hub, "subscribe", (async ()=>{ throw new Error("connect ECONNREFUSED"); }) as any);
      const res = await request(this.server).get(`/users/${user.uid}/activity`).set("Authorization", await bearer("bob")).set("Accept", "text/event-stream").expect(503);
      expect(res.headers["retry-after"]).to.equal("30");
      expect(res.text).not.to.include("ECONNREFUSED");
    });

    it("answers 503 rather than an incomplete stream if the connection is lost while the state is read", async function(){
      const getNotifications = hub.getNotifications;
      stub(hub, "getNotifications", async function(...args: any[]){
        await terminateHub();
        await until(()=> !hub.stats().listening);
        return await getNotifications.apply(hub, args as any);
      } as any);
      const res = await request(this.server).get(`/users/${user.uid}/activity`).set("Authorization", await bearer("bob")).set("Accept", "text/event-stream").expect(503);
      expect(res.headers["retry-after"]).to.equal("30");
    });

    it("leaves no subscription behind if reading the state fails", async function(){
      stub(hub, "getNotifications", (async ()=>{ throw new Error("State failed"); }) as any);
      await request(this.server).get(`/users/${user.uid}/activity`).set("Authorization", await bearer("bob")).set("Accept", "text/event-stream").expect(500);
      await until(()=> hub.stats().streams === 0);
    });
  });


  describe("sessions", function(){
    async function login(server: any, username: string){
      const res = await request(server).post("/auth/login")
        .send({username, password: "12345678"})
        .set("Content-Type", "application/json")
        .set("Accept", "")
        .expect(200);
      return (res.headers["set-cookie"] as unknown as string[]).map(c=> c.split(";")[0]).join("; ");
    }

    let original: number;
    this.beforeEach(function(){ original = locals.sessionMaxAge; });
    this.afterEach(function(){ locals.sessionMaxAge = original; });

    /** Stretches the configured lifetime so the session now sits under the renewal threshold */
    const makeSessionDue = ()=>{ locals.sessionMaxAge = original*100; };
    const expiries = async ()=> (await tasks.db.all<{expires_at: Date}>(`SELECT expires_at FROM user_sessions`)).map(s=> s.expires_at.valueOf());

    it("work with a session cookie", async function(){
      const stream = open(`/users/${user.uid}/activity`, {Cookie: await login(this.server, "bob")});
      await stream.connected;
      expect(stream.status).to.equal(200);
      await until(()=> stream.state);
    });

    it("aren't renewed by opening a stream, which a tab does by itself", async function(){
      const cookie = await login(this.server, "bob");
      makeSessionDue();
      const before = await expiries();
      const stream = open(`/users/${user.uid}/activity`, {Cookie: cookie});
      await stream.connected;
      expect(stream.status).to.equal(200);
      expect(stream.headers).not.to.have.property("set-cookie");
      expect(await expiries()).to.deep.equal(before);
    });

    it("are still renewed by the JSON answer", async function(){
      const cookie = await login(this.server, "bob");
      makeSessionDue();
      const before = await expiries();
      await request(this.server).get(`/users/${user.uid}/activity`).set("Cookie", cookie).expect(200).expect((res)=>{
        expect(res.headers).to.have.property("set-cookie");
      });
      expect(await expiries()).not.to.deep.equal(before);
    });

    it("are refused once revoked, which applies when the stream reconnects", async function(){
      const cookie = await login(this.server, "bob");
      const stream = open(`/users/${user.uid}/activity`, {Cookie: cookie});
      await stream.connected;
      await tasks.db.run(`DELETE FROM user_sessions`);
      await request(this.server).get(`/users/${user.uid}/activity`).set("Cookie", cookie).set("Accept", "text/event-stream").expect(401);
    });
  });
});
