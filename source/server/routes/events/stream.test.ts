import http from "node:http";
import { AddressInfo } from "node:net";
import timers from "node:timers/promises";

import request from "supertest";

import User from "../../auth/User.js";
import UserManager from "../../auth/UserManager.js";
import { EventHub } from "../../tasks/events.js";
import { TaskEvent } from "../../tasks/types.js";
import { TaskScheduler } from "../../tasks/scheduler.js";
import { AppLocals } from "../../utils/locals.js";
import Vfs from "../../vfs/index.js";


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
      this.req = http.request({port, path, headers, method, agent: false}, (res)=>{
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

  get snapshot(): TaskEvent[]|undefined{
    const frame = this.frames.find(f=> f.startsWith("event: snapshot\n"));
    return frame && JSON.parse(frame.slice("event: snapshot\ndata: ".length)).tasks;
  }

  get events(): TaskEvent[]{
    return this.frames.filter(f=> f.startsWith("event: task\n")).map(f=> JSON.parse(f.slice("event: task\ndata: ".length)));
  }

  /** The count of unread notifications in the snapshot, if any */
  get unread(): number|undefined{
    const frame = this.frames.find(f=> f.startsWith("event: snapshot\n"));
    return frame && JSON.parse(frame.slice("event: snapshot\ndata: ".length)).unread;
  }

  get notifications(): Array<{notification_id: number, user_id: number, type: string}>{
    return this.frames.filter(f=> f.startsWith("event: notification\n")).map(f=> JSON.parse(f.slice("event: notification\ndata: ".length)));
  }

  close(){
    this.req.destroy();
  }
}


describe("Event streams", function(){
  let locals: AppLocals, vfs: Vfs, userManager: UserManager, tasks: TaskScheduler, hub: EventHub;
  let user: User, other: User, admin: User;
  let scene_id: number;
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

  /** Opens a stream as this user, and waits for it to be ready */
  async function connect(path: string, as: string = "bob"){
    const stream = open(path, {Authorization: await bearer(as)});
    await stream.connected;
    expect(stream.status, stream.body).to.equal(200);
    await until(()=> stream.snapshot);
    return stream;
  }

  /** Replaces a method for the duration of the test */
  function stub<T extends object, K extends keyof T>(target: T, name: K, replacement: T[K]){
    const original = target[name];
    (target as any)[name] = replacement;
    restore.push(()=>{ delete (target as any)[name]; if(target[name] !== original) (target as any)[name] = original; });
  }

  this.beforeAll(async function(){
    locals = await createIntegrationContext(this);
    vfs = locals.vfs;
    userManager = locals.userManager;
    tasks = locals.taskScheduler;
    hub = locals.events;
    await new Promise<void>((resolve)=>{ server = this.server.listen(0, "127.0.0.1", resolve); });
    port = (server.address() as AddressInfo).port;
  });

  this.afterAll(async function(){
    server?.closeAllConnections();
    await new Promise((resolve)=> server ? server.close(resolve) : resolve(undefined));
  });

  this.beforeEach(async function(){
    await resetIntegrationContext(this);
    await locals.config.set("enable_events", true);
    user = await userManager.addUser("bob", "12345678", "create");
    other = await userManager.addUser("charlie", "12345678", "create");
    admin = await userManager.addUser("alice", "12345678", "admin");
    scene_id = await vfs.createScene("foo", user.uid);
  });

  this.afterEach(async function(){
    for(const undo of restore) undo();
    restore = [];
    for(const stream of streams) stream.close();
    streams = [];
    await until(()=> hub.stats().streams === 0);
  });


  describe("feature flag", function(){
    it("hides the routes when disabled", async function(){
      await locals.config.set("enable_events", false);
      const Authorization = await bearer("alice");
      for(const path of ["/events", `/events/users/${user.uid}`, "/events/scenes/foo"]){
        await request(this.server).get(path).set("Authorization", Authorization).expect(404);
      }
    });

    it("doesn't take over other routes", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      await request(this.server).get(`/tasks/${task.task_id}`).set("Authorization", await bearer("bob")).expect(200);
    });
  });


  describe("permissions", function(){
    const refused = (server: any, path: string, code: number, token?: string)=>{
      const r = request(server).get(path);
      if(token) r.set("Authorization", token);
      return r.expect(code);
    };

    it("rejects anonymous requests everywhere", async function(){
      await vfs.createScene("public");
      await refused(this.server, "/events", 401);
      await refused(this.server, `/events/users/${user.uid}`, 401);
      //The same answer for a scene that exists or not: it doesn't get as far as looking
      await refused(this.server, "/events/scenes/public", 401);
      await refused(this.server, "/events/scenes/nope", 401);
    });

    describe("/events", function(){
      it("is for admins", async function(){
        await refused(this.server, "/events", 401, await bearer("bob"));
        await connect("/events", "alice");
      });

      it("needs instance:read on a token", async function(){
        await refused(this.server, "/events", 403, await bearer("alice", ["tasks:admin"]));
        const stream = open("/events", {Authorization: await bearer("alice", ["instance:read"])});
        await stream.connected;
        expect(stream.status).to.equal(200);
      });
    });

    describe("/events/users/:uid", function(){
      it("is for that user", async function(){
        await connect(`/events/users/${user.uid}`, "bob");
      });

      it("is for admins", async function(){
        await connect(`/events/users/${user.uid}`, "alice");
      });

      it("isn't for other users", async function(){
        await refused(this.server, `/events/users/${user.uid}`, 401, await bearer("charlie"));
      });

      it("needs tasks:read on a token", async function(){
        await refused(this.server, `/events/users/${user.uid}`, 403, await bearer("bob", ["scenes:read"]));
        const stream = open(`/events/users/${user.uid}`, {Authorization: await bearer("bob", ["tasks:read"])});
        await stream.connected;
        expect(stream.status).to.equal(200);
      });

      it("won't match anything else than an ID", async function(){
        await refused(this.server, "/events/users/foo", 404, await bearer("alice"));
      });
    });

    describe("/events/scenes/:scene", function(){
      it("is for those who can write to the scene", async function(){
        await connect("/events/scenes/foo", "bob");
        await userManager.grant("foo", "charlie", "write");
        await connect("/events/scenes/foo", "charlie");
      });

      it("is for admins", async function(){
        await connect("/events/scenes/foo", "alice");
      });

      it("isn't for those who can only read it", async function(){
        //Scenes can be read by any logged-in user by default
        await request(this.server).get("/scenes/foo").set("Authorization", await bearer("charlie")).expect(200);
        await refused(this.server, "/events/scenes/foo", 404, await bearer("charlie"));
      });

      it("needs tasks:read and scenes:write on a token", async function(){
        await refused(this.server, "/events/scenes/foo", 403, await bearer("bob", ["scenes:write"]));
        await refused(this.server, "/events/scenes/foo", 403, await bearer("bob", ["tasks:read"]));
        const stream = open("/events/scenes/foo", {Authorization: await bearer("bob", ["tasks:read", "scenes:write"])});
        await stream.connected;
        expect(stream.status).to.equal(200);
      });

      it("answers 404 for a scene that doesn't exist", async function(){
        await refused(this.server, "/events/scenes/nope", 404, await bearer("bob"));
        await refused(this.server, "/events/scenes/nope", 404, await bearer("alice"));
      });
    });
  });


  describe("response", function(){
    it("is an unbuffered, private event stream", async function(){
      const stream = await connect(`/events/users/${user.uid}`);
      expect(stream.headers["content-type"]).to.match(/^text\/event-stream/);
      expect(stream.headers["cache-control"]).to.equal("no-cache, no-transform, private");
      expect(stream.headers["x-accel-buffering"]).to.equal("no");
    });

    it("tells clients how long to wait before reconnecting", async function(){
      const stream = await connect(`/events/users/${user.uid}`);
      expect(stream.frames[0]).to.match(/^retry: \d+$/);
    });

    it("HEAD doesn't hang", async function(){
      const res = await request(this.server).head(`/events/users/${user.uid}`).set("Authorization", await bearer("bob")).expect(200);
      expect(res.headers["content-type"]).to.match(/^text\/event-stream/);
      expect(hub.stats().streams).to.equal(0);
    });
  });


  describe("snapshot", function(){
    it("lists the tasks in flight for that scope, without their data or output", async function(){
      const pending = await tasks.create({type: "testTask", data: {secret: "secret"}, user_id: user.uid, scene_id, status: "pending"});
      const running = await tasks.create({type: "testTask", data: {secret: "secret"}, user_id: user.uid, status: "running"});
      const stream = await connect(`/events/users/${user.uid}`);
      expect(stream.snapshot).to.deep.equal([
        {task_id: pending.task_id, parent: null, type: "testTask", status: "pending", scene_id, user_id: user.uid},
        {task_id: running.task_id, parent: null, type: "testTask", status: "running", scene_id: null, user_id: user.uid},
      ]);
      expect(stream.body).not.to.include("secret");
    });

    it("is empty when nothing is in flight", async function(){
      const stream = await connect(`/events/users/${user.uid}`);
      expect(stream.snapshot).to.deep.equal([]);
    });

    for(const status of ["initializing", "success", "error"] as const){
      it(`leaves out ${status} tasks`, async function(){
        await tasks.create({type: "testTask", data: {}, user_id: user.uid, status});
        const stream = await connect(`/events/users/${user.uid}`);
        expect(stream.snapshot).to.deep.equal([]);
      });
    }

    it("only has that user's tasks", async function(){
      await tasks.create({type: "testTask", data: {}, user_id: other.uid});
      await tasks.create({type: "testTask", data: {}, scene_id});
      await tasks.create({type: "testTask", data: {}});
      const mine = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      const stream = await connect(`/events/users/${user.uid}`);
      expect(stream.snapshot!.map(t=> t.task_id)).to.deep.equal([mine.task_id]);
    });

    it("only has that scene's tasks", async function(){
      const otherScene = await vfs.createScene("bar", user.uid);
      await tasks.create({type: "testTask", data: {}, scene_id: otherScene});
      await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      const mine = await tasks.create({type: "testTask", data: {}, scene_id, user_id: other.uid});
      const stream = await connect("/events/scenes/foo");
      expect(stream.snapshot!.map(t=> t.task_id)).to.deep.equal([mine.task_id]);
    });

    it("has everything for admins on /events", async function(){
      const a = await tasks.create({type: "testTask", data: {}});
      const b = await tasks.create({type: "testTask", data: {}, user_id: other.uid});
      const stream = await connect("/events", "alice");
      expect(stream.snapshot!.map(t=> t.task_id)).to.deep.equal([a.task_id, b.task_id]);
    });

    it("comes before an event that happened while it was being read", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id: user.uid, status: "running"});
      const getActiveTasks = tasks.getActiveTasks;
      stub(tasks, "getActiveTasks", async function(...args: any[]){
        const stale = await getActiveTasks.apply(tasks, args as any);
        //The snapshot says "running", but it's already over by the time it gets written
        const frames: string[] = [];
        const stop = await hub.subscribe("all", {write: (f: string)=> frames.push(f), end(){}, destroy(){}, writableLength: 0});
        await tasks.releaseTask(task.task_id, {});
        await until(()=> frames.length);
        stop();
        return stale;
      } as any);
      const stream = await connect(`/events/users/${user.uid}`);
      expect(stream.snapshot!.map(t=> t.status)).to.deep.equal(["running"]);
      await until(()=> stream.events.length);
      expect(stream.events.map(t=> t.status)).to.deep.equal(["success"]);
      const types = stream.frames.map(f=> /^(event: \w+|retry)/.exec(f)?.[0]);
      expect(types).to.deep.equal(["retry", "event: snapshot", "event: task"]);
    });
  });


  describe("events", function(){
    it("follow a task through its lifecycle", async function(){
      const stream = await connect(`/events/users/${user.uid}`);
      await tasks.run({type: "testTask", data: {}, user_id: user.uid, handler: async ()=>{}});
      await until(()=> stream.events.length === 3);
      expect(stream.events.map(t=> t.status)).to.deep.equal(["pending", "running", "success"]);
    });

    it("are routed to those concerned", async function(){
      const mine = await connect(`/events/users/${user.uid}`);
      const theirs = await connect(`/events/users/${other.uid}`, "charlie");
      const scene = await connect("/events/scenes/foo");
      const all = await connect("/events", "alice");

      const task = await tasks.create({type: "testTask", data: {}, user_id: user.uid, scene_id});
      await until(()=> all.events.length && mine.events.length && scene.events.length);
      for(const stream of [mine, scene, all]) expect(stream.events.map(t=> t.task_id)).to.deep.equal([task.task_id]);
      expect(theirs.events).to.deep.equal([]);
    });

    it("don't reach the stream of another scene", async function(){
      const otherScene = await vfs.createScene("bar", user.uid);
      const stream = await connect("/events/scenes/foo");
      const barrier = await connect("/events/scenes/bar");
      await tasks.create({type: "testTask", data: {}, scene_id: otherScene});
      await until(()=> barrier.events.length);
      expect(stream.events).to.deep.equal([]);
    });

    it("reach a scene's stream when the task is attached to it later on", async function(){
      const task = await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      const stream = await connect("/events/scenes/foo");
      await tasks.setTaskScene(task.task_id, scene_id);
      await until(()=> stream.events.length);
      expect(stream.events[0]).to.include({task_id: task.task_id, scene_id});
    });
  });


  describe("inbox", function(){
    const notifyUser = (uid: number)=> tasks.db.run(`INSERT INTO notifications(fk_user_id, type) VALUES ($1, 'testNotification')`, [uid]);

    /** Connects with a token, which doesn't go through connect()'s default */
    async function connectWith(path: string, Authorization: string){
      const stream = open(path, {Authorization});
      await stream.connected;
      expect(stream.status).to.equal(200);
      await until(()=> stream.snapshot);
      return stream;
    }

    /** Proves that an event went through, so that nothing arriving on another stream can still be on its way */
    async function barrier(){
      const stream = await connect(`/events/users/${other.uid}`, "charlie");
      await notifyUser(other.uid);
      await until(()=> stream.notifications.length);
    }

    it("counts unread notifications in the snapshot of your own stream", async function(){
      await notifyUser(user.uid);
      await notifyUser(user.uid);
      await notifyUser(other.uid);
      const read = await tasks.db.get<{notification_id: number}>(`INSERT INTO notifications(fk_user_id, type, read_at) VALUES ($1, 'read', now()) RETURNING notification_id`, [user.uid]);
      expect(read).to.be.ok;
      const stream = await connect(`/events/users/${user.uid}`);
      expect(stream.unread).to.equal(2);
    });

    it("says there are none rather than leaving it out", async function(){
      const stream = await connect(`/events/users/${user.uid}`);
      expect(stream.unread).to.equal(0);
    });

    it("signals new notifications, with no text in them", async function(){
      const stream = await connect(`/events/users/${user.uid}`);
      const task = await tasks.create({type: "testTask", data: {secret: "secret"}, user_id: user.uid, notify: true, status: "running"});
      await tasks.releaseTask(task.task_id, {secret: "secret"});
      await until(()=> stream.notifications.length);
      expect(stream.notifications[0]).to.include({user_id: user.uid, type: "task"});
      expect(stream.notifications[0]).to.have.all.keys("notification_id", "user_id", "type");
      expect(stream.body).not.to.include("secret");
    });

    it("isn't given to an admin watching someone else", async function(){
      await notifyUser(user.uid);
      const stream = await connect(`/events/users/${user.uid}`, "alice");
      expect(stream.unread).to.equal(undefined);
      await notifyUser(user.uid);
      await barrier();
      expect(stream.notifications).to.deep.equal([]);
    });

    it("is given to an admin watching themselves", async function(){
      await notifyUser(admin.uid);
      const stream = await connect(`/events/users/${admin.uid}`, "alice");
      expect(stream.unread).to.equal(1);
      await notifyUser(admin.uid);
      await until(()=> stream.notifications.length);
    });

    it("isn't given to a token with tasks:read only, which still gets task events", async function(){
      await notifyUser(user.uid);
      const stream = await connectWith(`/events/users/${user.uid}`, await bearer("bob", ["tasks:read"]));
      expect(stream.unread).to.equal(undefined);
      await notifyUser(user.uid);
      await barrier();
      expect(stream.notifications).to.deep.equal([]);
      await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      await until(()=> stream.events.length);
    });

    it("is given to a token that also has account:read", async function(){
      await notifyUser(user.uid);
      const stream = await connectWith(`/events/users/${user.uid}`, await bearer("bob", ["tasks:read", "account:read"]));
      expect(stream.unread).to.equal(1);
    });

    it("isn't part of a scene's stream", async function(){
      await notifyUser(user.uid);
      const stream = await connect("/events/scenes/foo");
      expect(stream.unread).to.equal(undefined);
      await notifyUser(user.uid);
      await barrier();
      expect(stream.notifications).to.deep.equal([]);
    });

    it("isn't part of the stream of all tasks", async function(){
      await notifyUser(admin.uid);
      const stream = await connect("/events", "alice");
      expect(stream.unread).to.equal(undefined);
      await notifyUser(admin.uid);
      await barrier();
      expect(stream.notifications).to.deep.equal([]);
    });
  });


  describe("lifecycle", function(){
    it("frees the subscription when the client leaves", async function(){
      const stream = await connect(`/events/users/${user.uid}`);
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
      const stream = open(`/events/users/${user.uid}`, {Authorization: await bearer("bob")});
      stream.connected.catch(()=>{}); //It's going to be interrupted
      await until(()=> called);
      stream.close();
      await timers.setTimeout(20); //For the server to see it. It has no way to tell us.
      proceed();
      await until(()=> subscribed);
      await until(()=> hub.stats().streams === 0);
    });

    it("frees the subscription of a client that left while it was connecting", async function(){
      const getActiveTasks = tasks.getActiveTasks;
      let left!: ()=>void;
      const leaving = new Promise<void>((resolve)=>{ left = resolve; });
      stub(tasks, "getActiveTasks", async function(...args: any[]){
        await leaving;
        return await getActiveTasks.apply(tasks, args as any);
      } as any);
      const stream = open(`/events/users/${user.uid}`, {Authorization: await bearer("bob")});
      await until(()=> hub.stats().streams === 1);
      stream.close();
      await until(()=> hub.stats().streams === 0);
      left();
    });

    it("expires, for permissions to get checked again", async function(){
      this.timeout(5000);
      await locals.config.set("event_stream_seconds", 1);
      try{
        const stream = await connect(`/events/users/${user.uid}`);
        await timers.setTimeout(500);
        expect(stream.ended, "at 500ms").to.be.false;
        await until(()=> stream.ended);
        expect(hub.stats().streams).to.equal(0);
      }finally{
        await locals.config.set("event_stream_seconds", 900);
      }
    });

    it("ignores a lifetime of 0, which would remove the expiry", async function(){
      await locals.config.set("event_stream_seconds", 0);
      try{
        const stream = await connect(`/events/users/${user.uid}`);
        await timers.setTimeout(50);
        expect(stream.ended).to.be.false;
      }finally{
        await locals.config.set("event_stream_seconds", 900);
      }
    });

    it("ends if the database connection is lost", async function(){
      const stream = await connect(`/events/users/${user.uid}`);
      await tasks.db.run(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'ecorpus:events' AND datname = current_database()`);
      await until(()=> stream.ended);
      //And comes back when the client does
      const again = await connect(`/events/users/${user.uid}`);
      await tasks.create({type: "testTask", data: {}, user_id: user.uid});
      await until(()=> again.events.length);
    });
  });


  describe("refusals", function(){
    it("refuses a user's streams beyond the limit, without affecting others", async function(){
      const path = `/events/users/${user.uid}`;
      const opened: TestStream[] = [];
      for(let i = 0; i < 8; i++) opened.push(await connect(path));

      const res = await request(this.server).get(path).set("Authorization", await bearer("bob")).expect(429);
      expect(res.headers["retry-after"]).to.equal("30");
      expect(opened.some(s=> s.ended), "existing streams are left alone").to.be.false;

      await connect(`/events/users/${other.uid}`, "charlie");

      opened[0].close();
      await until(()=> hub.stats().streams === 8);
      await connect(path);
    });

    it("counts them against the requester, whatever they watch", async function(){
      for(let i = 0; i < 8; i++) await connect(`/events/users/${user.uid}`, "alice");
      await request(this.server).get("/events").set("Authorization", await bearer("alice")).expect(429);
      await connect(`/events/users/${user.uid}`, "bob");
    });

    it("answers 503 if events can't be subscribed to", async function(){
      stub(hub, "subscribe", (async ()=>{ throw new Error("connect ECONNREFUSED"); }) as any);
      const res = await request(this.server).get(`/events/users/${user.uid}`).set("Authorization", await bearer("bob")).expect(503);
      expect(res.headers["retry-after"]).to.equal("30");
      expect(res.text).not.to.include("ECONNREFUSED");
    });

    it("answers 503 rather than an empty stream if the connection is lost during the snapshot", async function(){
      const getActiveTasks = tasks.getActiveTasks;
      stub(tasks, "getActiveTasks", async function(...args: any[]){
        await tasks.db.run(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'ecorpus:events' AND datname = current_database()`);
        await until(()=> !hub.stats().listening);
        return await getActiveTasks.apply(tasks, args as any);
      } as any);
      const res = await request(this.server).get(`/events/users/${user.uid}`).set("Authorization", await bearer("bob")).expect(503);
      expect(res.headers["retry-after"]).to.equal("30");
    });

    it("leaves no subscription behind if the snapshot fails", async function(){
      stub(tasks, "getActiveTasks", (async ()=>{ throw new Error("Snapshot failed"); }) as any);
      await request(this.server).get(`/events/users/${user.uid}`).set("Authorization", await bearer("bob")).expect(500);
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

    it("work with a session cookie", async function(){
      const stream = open(`/events/users/${user.uid}`, {Cookie: await login(this.server, "bob")});
      await stream.connected;
      expect(stream.status).to.equal(200);
      await until(()=> stream.snapshot);
    });

    describe("renewal", function(){
      const maxAge = ()=> locals.sessionMaxAge;
      let original: number;
      this.beforeEach(function(){ original = maxAge(); });
      this.afterEach(function(){ locals.sessionMaxAge = original; });

      /** Stretches the configured lifetime so the session now sits under the renewal threshold */
      const makeSessionDue = ()=>{ locals.sessionMaxAge = original*100; };

      const expiries = async ()=> (await tasks.db.all<{expires_at: Date}>(`SELECT expires_at FROM user_sessions`)).map(s=> s.expires_at.valueOf());

      for(const [name, path] of [
        ["all tasks", ()=> "/events"],
        ["a user's tasks", ()=> `/events/users/${admin.uid}`],
        ["a scene's tasks", ()=> "/events/scenes/foo"],
      ] as const){
        it(`isn't triggered by opening a stream of ${name}`, async function(){
          const cookie = await login(this.server, "alice");
          makeSessionDue();
          const before = await expiries();
          const stream = open(path(), {Cookie: cookie});
          await stream.connected;
          expect(stream.status).to.equal(200);
          expect(stream.headers).not.to.have.property("set-cookie");
          expect(await expiries()).to.deep.equal(before);
        });
      }

      it("is still triggered by other routes", async function(){
        const cookie = await login(this.server, "bob");
        makeSessionDue();
        const before = await expiries();
        await request(this.server).get("/auth/login").set("Cookie", cookie).set("Accept", "application/json").expect((res)=>{
          expect(res.headers).to.have.property("set-cookie");
        });
        expect(await expiries()).not.to.deep.equal(before);
      });

      it("doesn't extend to similar paths", async function(){
        const cookie = await login(this.server, "bob");
        makeSessionDue();
        await request(this.server).get("/eventsfoo").set("Cookie", cookie).expect((res)=>{
          expect(res.headers).to.have.property("set-cookie");
        });
      });
    });

    it("are refused once revoked, which applies when the stream reconnects", async function(){
      const cookie = await login(this.server, "bob");
      const stream = open(`/events/users/${user.uid}`, {Cookie: cookie});
      await stream.connected;
      await tasks.db.run(`DELETE FROM user_sessions`);
      await request(this.server).get(`/events/users/${user.uid}`).set("Cookie", cookie).expect(401);
    });
  });
});
