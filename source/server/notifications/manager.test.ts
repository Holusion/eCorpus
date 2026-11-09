// Tests for notifications management, and the relaying of their changes to subscribers

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import timers from "node:timers/promises";

import UserManager from "../auth/UserManager.js";
import createService from "../create.js";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import { NotificationManager, NotificationManagerOptions, NotificationSink } from "./manager.js";
import { TaskManager } from "../tasks/manager.js";


describe("NotificationManager", function(){
  let db_uri: string, handle: Database, tasks: TaskManager, notifications: NotificationManager;
  let user_id: number, other_user_id: number, barrier_user_id: number;
  let hubs: NotificationManager[] = [];
  let cleanups: Array<()=>unknown> = [];

  class TestSink implements NotificationSink{
    frames: string[] = [];
    ended = false;
    destroyed = false;
    writableLength = 0;
    write(frame: string){ this.frames.push(frame); }
    end(){ this.ended = true; }
    destroy(){ this.destroyed = true; }
    get events(): Array<{event: string, data: any}>{
      return this.frames.filter(f=> f.startsWith("event: ")).map(f=>{
        const [, event, data] = /^event: ([^\n]+)\ndata: ([^\n]+)\n\n$/.exec(f)!;
        return {event, data: JSON.parse(data)};
      });
    }
  }

  /** Gives up eventually: a loop outliving its failed test would keep mocha from exiting */
  async function until(condition: ()=>unknown){
    const deadline = Date.now() + 5000;
    while(!await condition()){
      if(deadline < Date.now()) throw new Error(`Timeout waiting for: ${condition}`);
      await timers.setTimeout(2);
    }
  }

  /** Notifies a user about a new task, which signals it */
  async function signal(user_id: number, type = "testTask"){
    const task = await tasks.create({type, data: {}, user_id});
    await notifications.notify(task);
    return task;
  }

  function hubFor(options: Partial<NotificationManagerOptions> = {}){
    const hub = new NotificationManager({db: handle, uri: db_uri, ...options});
    hubs.push(hub);
    return hub;
  }

  /** The PIDs of the hubs' connections to the test database */
  async function backends(): Promise<number[]>{
    const rows = await handle.all<{pid: number}>(`
      SELECT pid FROM pg_stat_activity
      WHERE application_name = 'ecorpus:notifications' AND datname = current_database()
    `);
    return rows.map(r=> r.pid);
  }

  const noBackend = async ()=> (await backends()).length === 0;

  /**
   * Waits for the hub to have processed everything committed so far: signals arrive in commit order,
   * and delivery is synchronous, so a subscriber that hasn't received one by then won't.
   */
  async function barrier(hub: NotificationManager){
    const sink = new TestSink();
    await hub.subscribe(barrier_user_id, sink);
    return async function flush(){
      const {task_id} = await signal(barrier_user_id, "barrier");
      await until(()=> sink.events.some(e=> e.data.task_id === task_id));
    };
  }

  this.beforeAll(async function(){
    db_uri = await getUniqueDb("ecorpus_notification_hub_tests");
    handle = await openDatabase({uri: db_uri});
    const userManager = new UserManager(handle);
    tasks = new TaskManager(handle);
    //Never subscribed to: it doesn't connect to anything
    notifications = new NotificationManager({db: handle, uri: db_uri});
    const addUser = async ()=> (await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"))).uid;
    user_id = await addUser();
    other_user_id = await addUser();
    barrier_user_id = await addUser();
  });

  this.afterAll(async function(){
    await handle?.end();
    await dropDb(db_uri);
  });

  this.afterEach(async function(){
    await Promise.all(hubs.map(h=> h.close()));
    hubs = [];
    for(const cleanup of cleanups) await cleanup();
    cleanups = [];
    await until(noBackend);
  });


  describe("notify()", function(){
    const notificationsOf = async (task_id: number)=> await handle.all("SELECT fk_user_id, fk_task_id, type, read FROM notifications WHERE fk_task_id = $1", [task_id]);

    it("notifies a task's user", async function(){
      const task = await tasks.create({ scene_id: null, user_id, type: "delayTask", data: {} });
      expect(await notificationsOf(task.task_id)).to.deep.equal([]);
      await notifications.notify(task);
      expect(await notificationsOf(task.task_id)).to.deep.equal([
        { fk_user_id: user_id, fk_task_id: task.task_id, type: "delayTask", read: false },
      ]);
    });

    it("does nothing if they're already notified", async function(){
      const task = await tasks.create({ scene_id: null, user_id, type: "delayTask", data: {} });
      await notifications.notify(task);
      await notifications.notify(task);
      expect(await notificationsOf(task.task_id)).to.have.length(1);
    });

    it("can't notify about a task without a user", async function(){
      const task = await tasks.create({ scene_id: null, user_id: null, type: "delayTask", data: {} });
      await expect(notifications.notify(task)).to.be.rejected;
      expect(await notificationsOf(task.task_id)).to.deep.equal([]);
    });
  });


  describe("markRead()", function(){
    const readOf = async (id: number)=> (await handle.get<{read: boolean}>("SELECT read FROM notifications WHERE notification_id = $1", [id]))?.read;
    async function notificationOf(user_id: number){
      const {task_id} = await signal(user_id);
      return (await handle.get<{notification_id: number}>("SELECT notification_id FROM notifications WHERE fk_task_id = $1", [task_id]))!.notification_id;
    }

    it("marks a user's notifications as read", async function(){
      const ids = [await notificationOf(user_id), await notificationOf(user_id)];
      const untouched = await notificationOf(user_id);
      expect(await notifications.markRead(user_id, ids)).to.equal(2);
      expect(await readOf(ids[0])).to.be.true;
      expect(await readOf(ids[1])).to.be.true;
      expect(await readOf(untouched)).to.be.false;
    });

    it("only counts those that change", async function(){
      const id = await notificationOf(user_id);
      expect(await notifications.markRead(user_id, [id])).to.equal(1);
      expect(await notifications.markRead(user_id, [id])).to.equal(0);
    });

    it("ignores someone else's notifications", async function(){
      const id = await notificationOf(other_user_id);
      expect(await notifications.markRead(user_id, [id])).to.equal(0);
      expect(await readOf(id)).to.be.false;
    });

    it("ignores ids that don't exist", async function(){
      expect(await notifications.markRead(user_id, [Number.MAX_SAFE_INTEGER])).to.equal(0);
      expect(await notifications.markRead(user_id, [])).to.equal(0);
    });
  });


  describe("connection", function(){
    it("doesn't connect until someone subscribes", async function(){
      const hub = hubFor();
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
      expect(await backends()).to.deep.equal([]);
      await hub.subscribe(user_id, new TestSink());
      expect(hub.stats()).to.deep.equal({streams: 1, listening: true});
      expect(await backends()).to.have.length(1);
    });

    it("shares one connection between subscribers", async function(){
      const hub = hubFor({maxStreamsPerUser: 20});
      await Promise.all(Array.from({length: 10}, ()=> hub.subscribe(user_id, new TestSink())));
      await hub.subscribe(other_user_id, new TestSink());
      expect(hub.stats()).to.deep.equal({streams: 11, listening: true});
      expect(await backends()).to.have.length(1);
    });

    it("guarantees delivery of what's committed after subscribe() resolves", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      const task = await signal(user_id);
      await until(()=> sink.events.length);
      expect(sink.events[0].data.task_id).to.equal(task.task_id);
    });

    it("keeps the connection through a brief absence of subscribers", async function(){
      const hub = hubFor({idleTimeoutMillis: 60000});
      const unsubscribe = await hub.subscribe(user_id, new TestSink());
      const before = await backends();
      unsubscribe();
      await timers.setTimeout(20);
      expect(hub.stats()).to.deep.equal({streams: 0, listening: true});
      await hub.subscribe(user_id, new TestSink());
      expect(await backends()).to.deep.equal(before);
    });

    it("closes the connection once no subscriber is left for long enough", async function(){
      const hub = hubFor({idleTimeoutMillis: 10});
      const first = await hub.subscribe(user_id, new TestSink());
      const second = await hub.subscribe(user_id, new TestSink());
      first();
      await timers.setTimeout(30);
      expect(hub.stats().listening, "one subscriber remains").to.be.true;
      second();
      await until(()=> !hub.stats().listening);
      await until(noBackend);
    });

    it("reconnects for a subscriber that comes after that", async function(){
      const hub = hubFor({idleTimeoutMillis: 1});
      (await hub.subscribe(user_id, new TestSink()))();
      await until(()=> !hub.stats().listening);
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      await signal(user_id);
      await until(()=> sink.events.length);
    });

    it("rejects subscribers if the database is unavailable", async function(){
      const hub = hubFor({uri: "postgres://localhost:1/nope"});
      const sink = new TestSink();
      await expect(hub.subscribe(user_id, sink)).to.be.rejected;
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
      expect(sink.ended, "was never subscribed").to.be.false;
    });
  });


  describe("routing", function(){
    it("sends a user's notifications to that user's subscribers only", async function(){
      const hub = hubFor();
      const flush = await barrier(hub);
      const mine = new TestSink(), other = new TestSink();
      await hub.subscribe(user_id, mine);
      await hub.subscribe(other_user_id, other);
      const task = await signal(user_id);
      await flush();
      expect(mine.events.map(e=> e.data.task_id)).to.deep.equal([task.task_id]);
      expect(other.frames).to.deep.equal([]);
    });

    it("sends it to every subscriber of that user, once each", async function(){
      const hub = hubFor();
      const flush = await barrier(hub);
      const first = new TestSink(), second = new TestSink();
      await hub.subscribe(user_id, first);
      await hub.subscribe(user_id, second, {owner: other_user_id});
      await signal(user_id);
      await flush();
      for(const sink of [first, second]) expect(sink.events).to.have.length(1);
    });

    it("stops sending after unsubscribing, which can be done twice", async function(){
      const hub = hubFor();
      const flush = await barrier(hub);
      const sink = new TestSink();
      const unsubscribe = await hub.subscribe(user_id, sink);
      unsubscribe();
      unsubscribe();
      expect(hub.stats().streams, "only the barrier is left").to.equal(1);
      await signal(user_id);
      await flush();
      expect(sink.frames).to.deep.equal([]);
      expect(sink.ended, "the sink belongs to the caller").to.be.false;
    });
  });


  describe("frames", function(){
    it("are valid server-sent events, with the notification as data", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      const task = await signal(user_id);
      await until(()=> sink.frames.length);
      expect(sink.frames[0]).to.match(/^event: notification\ndata: [^\n]+\n\n$/);
      const {mtime, notification_id, ...item} = sink.events[0].data;
      expect(item).to.deep.equal({task_id: task.task_id, type: "testTask", status: "pending", read: false});
      expect(notification_id).to.be.a("number");
      expect(new Date(mtime).valueOf()).to.be.closeTo(Date.now(), 60000);
    });

    it("can't be broken by the content of a task's type", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      await signal(user_id, "line\n\ndata: forged\n\n");
      await until(()=> sink.frames.length);
      expect(sink.frames[0].match(/\n\n/g), "only the frame's terminator").to.have.length(1);
      expect(sink.events[0].data.type).to.equal("line\n\ndata: forged\n\n");
    });

    it("ignores malformed signals", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      for(const payload of [
        "not json",
        "null",
        `{"foo": "bar"}`,
        `{"user_id": ${user_id}}`,
        `{"user_id": ${user_id}, "item": null}`,
        `{"user_id": "${user_id}", "item": {}}`,
      ]){
        await handle.run(`SELECT pg_notify('notifications', $1)`, [payload]);
      }
      await signal(user_id);
      await until(()=> sink.frames.length);
      expect(sink.events).to.have.length(1);
      expect(sink.events[0].data.type).to.equal("testTask");
    });
  });


  describe("heartbeat", function(){
    it("reaches every subscriber", async function(){
      const hub = hubFor({heartbeatMillis: 5});
      const mine = new TestSink(), other = new TestSink();
      await hub.subscribe(user_id, mine);
      await hub.subscribe(other_user_id, other);
      await until(()=> mine.frames.length && other.frames.length);
      expect(mine.frames[0]).to.equal("event: ping\ndata:\n\n");
      expect(other.frames[0]).to.equal("event: ping\ndata:\n\n");
    });

    it("carries on when one of several subscribers leaves", async function(){
      const hub = hubFor({heartbeatMillis: 5});
      const unsubscribe = await hub.subscribe(user_id, new TestSink());
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      unsubscribe();
      await until(()=> sink.frames.length);
    });

    it("resumes for a subscriber arriving after the last one left", async function(){
      const hub = hubFor({heartbeatMillis: 5});
      (await hub.subscribe(user_id, new TestSink()))();
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      await until(()=> sink.frames.length);
    });
  });


  describe("bad subscribers", function(){
    it("drops a slow one on an event, leaving the others alone", async function(){
      const hub = hubFor({maxBufferBytes: 100});
      const flush = await barrier(hub);
      const slow = new TestSink(), other = new TestSink();
      slow.writableLength = 101;
      await hub.subscribe(user_id, slow);
      await hub.subscribe(user_id, other);
      await signal(user_id);
      await flush();
      expect(slow.destroyed).to.be.true;
      expect(other.destroyed).to.be.false;
      expect(other.events).to.have.length(1);
      expect(hub.stats().streams).to.equal(2);
    });

    it("drops a slow one on a heartbeat", async function(){
      const hub = hubFor({maxBufferBytes: 100, heartbeatMillis: 5});
      const slow = new TestSink();
      slow.writableLength = 101;
      await hub.subscribe(user_id, slow);
      await until(()=> slow.destroyed);
      expect(hub.stats().streams).to.equal(0);
    });

    it("keeps one at the limit", async function(){
      const hub = hubFor({maxBufferBytes: 100, heartbeatMillis: 5});
      const sink = new TestSink();
      sink.writableLength = 100;
      await hub.subscribe(user_id, sink);
      await until(()=> sink.frames.length);
      expect(sink.destroyed).to.be.false;
    });

    it("survives one that throws", async function(){
      const hub = hubFor();
      const flush = await barrier(hub);
      class ThrowingSink extends TestSink{
        write(){ throw new Error("Failed to write"); }
        destroy(){ throw new Error("Failed to destroy"); }
      }
      const bad = new ThrowingSink(), good = new TestSink();
      await hub.subscribe(user_id, bad);
      await hub.subscribe(user_id, good);
      await signal(user_id);
      await flush();
      expect(good.events).to.have.length(1);
      expect(hub.stats().streams, "good and the barrier").to.equal(2);
    });
  });


  describe("limits", function(){
    it("refuses subscribers beyond the limit per user, until one leaves", async function(){
      const hub = hubFor({maxStreamsPerUser: 2});
      const first = await hub.subscribe(user_id, new TestSink());
      await hub.subscribe(user_id, new TestSink());
      await expect(hub.subscribe(user_id, new TestSink())).to.be.rejectedWith("[429]");
      expect(hub.stats().streams).to.equal(2);

      await hub.subscribe(other_user_id, new TestSink());
      first();
      await hub.subscribe(user_id, new TestSink());
      expect(hub.stats().streams).to.equal(3);
    });

    it("counts subscribers against their owner, not the user they watch", async function(){
      //An admin watching someone doesn't use up that user's slots
      const hub = hubFor({maxStreamsPerUser: 1});
      await hub.subscribe(user_id, new TestSink(), {owner: other_user_id});
      await hub.subscribe(user_id, new TestSink());
      await expect(hub.subscribe(other_user_id, new TestSink())).to.be.rejectedWith("[429]");
    });

    it("refuses subscribers beyond the global limit, until one leaves", async function(){
      const hub = hubFor({maxStreams: 2});
      const first = await hub.subscribe(user_id, new TestSink());
      await hub.subscribe(other_user_id, new TestSink());
      await expect(hub.subscribe(barrier_user_id, new TestSink())).to.be.rejectedWith("[503]");
      first();
      await hub.subscribe(barrier_user_id, new TestSink());
    });

    it("gives slots back when a subscriber is dropped", async function(){
      const hub = hubFor({maxStreamsPerUser: 1, maxBufferBytes: 100, heartbeatMillis: 5});
      const slow = new TestSink();
      slow.writableLength = 101;
      await hub.subscribe(user_id, slow);
      await until(()=> slow.destroyed);
      await hub.subscribe(user_id, new TestSink());
    });

    it("gives slots back when the connection is lost", async function(){
      const hub = hubFor({maxStreamsPerUser: 1});
      await hub.subscribe(user_id, new TestSink());
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> !hub.stats().listening);
      await hub.subscribe(user_id, new TestSink());
    });
  });


  describe("connection loss", function(){
    it("ends subscribers when the server closes the connection", async function(){
      const hub = hubFor();
      const mine = new TestSink(), other = new TestSink();
      await hub.subscribe(user_id, mine);
      await hub.subscribe(other_user_id, other);
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> mine.ended && other.ended);
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
    });

    it("recovers when subscribers come back", async function(){
      const hub = hubFor();
      await hub.subscribe(user_id, new TestSink());
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> !hub.stats().listening);

      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      expect(await backends()).to.have.length(1);
      await signal(user_id);
      await until(()=> sink.events.length);
    });

    it("doesn't end a sink that had unsubscribed", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      (await hub.subscribe(user_id, sink))();
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> !hub.stats().listening);
      expect(sink.ended).to.be.false;
    });

    it("leaves the count right when an ended subscriber unsubscribes late", async function(){
      //What a request's "close" handler does after the hub ended its response
      const hub = hubFor();
      const unsubscribe = await hub.subscribe(user_id, new TestSink());
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> !hub.stats().listening);

      await hub.subscribe(user_id, new TestSink());
      unsubscribe();
      expect(hub.stats()).to.deep.equal({streams: 1, listening: true});
    });

    /** Forwards traffic to the database, until it is told to go silent without closing anything */
    async function silentProxy(){
      const target = new URL(db_uri);
      const pairs: Array<[net.Socket, net.Socket]> = [];
      const server = net.createServer((incoming)=>{
        const outgoing = net.connect(parseInt(target.port), target.hostname);
        for(const socket of [incoming, outgoing]) socket.on("error", ()=>{});
        incoming.pipe(outgoing);
        outgoing.pipe(incoming);
        pairs.push([incoming, outgoing]);
      });
      await new Promise<void>((resolve)=> server.listen(0, "127.0.0.1", resolve));
      const uri = new URL(db_uri);
      uri.hostname = "127.0.0.1";
      uri.port = (server.address() as net.AddressInfo).port.toString();
      cleanups.push(async ()=>{
        for(const pair of pairs) for(const socket of pair) socket.destroy();
        await new Promise((resolve)=> server.close(resolve));
      });
      return {
        uri: uri.toString(),
        silence(){
          for(const [incoming, outgoing] of pairs){
            incoming.unpipe(outgoing);
            outgoing.unpipe(incoming);
          }
        },
      };
    }

    it("is detected when the connection goes silent", async function(){
      const proxy = await silentProxy();
      const hub = hubFor({uri: proxy.uri, healthCheckMillis: 10, healthCheckTimeoutMillis: 20});
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      await timers.setTimeout(50);
      expect(sink.ended, "the connection is working").to.be.false;
      proxy.silence();
      await until(()=> sink.ended);
      expect(hub.stats().listening).to.be.false;
    });

    it("close() doesn't hang on a silent connection", async function(){
      const proxy = await silentProxy();
      const hub = hubFor({uri: proxy.uri});
      await hub.subscribe(user_id, new TestSink());
      proxy.silence();
      await hub.close();
    });
  });


  describe("close()", function(){
    it("ends subscribers and disconnects", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe(user_id, sink);
      await hub.close();
      expect(sink.ended).to.be.true;
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
      await until(noBackend);
    });

    it("can be called twice", async function(){
      const hub = hubFor();
      await hub.subscribe(user_id, new TestSink());
      await Promise.all([hub.close(), hub.close()]);
      await hub.close();
    });

    it("works if nothing ever subscribed", async function(){
      await hubFor().close();
      expect(await backends()).to.deep.equal([]);
    });

    it("rejects later subscribers without trying to connect", async function(){
      //An unreachable database would make it fail with another message
      const hub = hubFor({uri: "postgres://localhost:1/nope"});
      await hub.close();
      await expect(hub.subscribe(user_id, new TestSink())).to.be.rejectedWith("closed");
    });

    it("rejects a subscriber that was connecting and leaves no connection behind", async function(){
      const hub = hubFor();
      const subscribing = hub.subscribe(user_id, new TestSink());
      await hub.close();
      await expect(subscribing).to.be.rejectedWith("closed");
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
      await until(noBackend);
    });
  });


  describe("createService()", function(){
    let uri: string, dir: string;
    this.beforeEach(async function(){
      uri = await getUniqueDb("ecorpus_notification_service_tests");
      dir = await fs.mkdtemp(path.join(tmpdir(), "ecorpus_notification_service_tests"));
    });
    this.afterEach(async function(){
      await dropDb(uri);
      await fs.rm(dir, {recursive: true, force: true});
    });

    it("provides a hub that's closed with the services", async function(){
      this.timeout(10000); //Runs all the migrations
      const services = await createService({ROOT_DIR: dir, DATABASE_URI: uri, CLEAN_DATABASE: "false"});
      let closed = false;
      try{
        expect(services.app.locals.notifications).to.equal(services.notifications);
        expect(services.notifications.stats().listening, "lazily").to.be.false;

        const user = await services.userManager.addUser("alice", "12345678");
        const sink = new TestSink();
        await services.notifications.subscribe(user.uid, sink);
        await services.notifications.notify(await services.taskScheduler.create({type: "testTask", data: {}, user_id: user.uid}));
        await until(()=> sink.events.length);

        await services.close();
        closed = true;
        expect(sink.ended).to.be.true;
        expect(services.notifications.stats().listening).to.be.false;
      }finally{
        if(!closed) await services.close();
      }
    });
  });
});
