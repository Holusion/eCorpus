// Tests for the hub relaying events to subscribers

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import timers from "node:timers/promises";

import UserManager from "../auth/UserManager.js";
import createService from "../create.js";
import openDatabase, { Database } from "../vfs/helpers/db.js";
import Vfs from "../vfs/index.js";
import { NotificationEvent, EventHub, EventHubOptions, EventSink } from "./events.js";
import { TaskManager } from "./manager.js";
import { TaskEvent } from "./types.js";


describe("EventHub", function(){
  let db_uri: string, handle: Database, tasks: TaskManager;
  let scene_id: number, other_scene_id: number, user_id: number, other_user_id: number;
  let hubs: EventHub[] = [];
  let cleanups: Array<()=>unknown> = [];

  class TestSink implements EventSink{
    frames: string[] = [];
    ended = false;
    destroyed = false;
    writableLength = 0;
    write(frame: string){ this.frames.push(frame); }
    end(){ this.ended = true; }
    destroy(){ this.destroyed = true; }
    get events(): TaskEvent[]{
      return this.frames.filter(f=> f.startsWith("event: task\n")).map(f=> JSON.parse(f.slice("event: task\ndata: ".length)));
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

  function hubFor(options: Partial<EventHubOptions> = {}){
    const hub = new EventHub({uri: db_uri, ...options});
    hubs.push(hub);
    return hub;
  }

  /** The PIDs of the hubs' connections to the test database */
  async function backends(): Promise<number[]>{
    const rows = await handle.all<{pid: number}>(`
      SELECT pid FROM pg_stat_activity
      WHERE application_name = 'ecorpus:events' AND datname = current_database()
    `);
    return rows.map(r=> r.pid);
  }

  const noBackend = async ()=> (await backends()).length === 0;

  /**
   * A subscriber to everything, to wait for the hub to have processed a number of events.
   * Delivery is synchronous, so a subscriber that hasn't received an event by then won't.
   */
  async function barrier(hub: EventHub){
    const sink = new TestSink();
    await hub.subscribe("all", sink);
    return {
      sink,
      received: (count: number)=> until(()=> count <= sink.events.length),
    };
  }

  this.beforeAll(async function(){
    db_uri = await getUniqueDb("ecorpus_task_event_hub_tests");
    handle = await openDatabase({uri: db_uri});
    const vfs = new Vfs("/dev/null", handle);
    const userManager = new UserManager(handle);
    tasks = new TaskManager(handle);
    scene_id = await vfs.createScene(randomBytes(8).toString("base64url"));
    other_scene_id = await vfs.createScene(randomBytes(8).toString("base64url"));
    user_id = (await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"))).uid;
    other_user_id = (await userManager.addUser(randomBytes(8).toString("base64url"), randomBytes(8).toString("base64url"))).uid;
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


  describe("connection", function(){
    it("doesn't connect until someone subscribes", async function(){
      const hub = hubFor();
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
      expect(await backends()).to.deep.equal([]);
      await hub.subscribe("all", new TestSink());
      expect(hub.stats()).to.deep.equal({streams: 1, listening: true});
      expect(await backends()).to.have.length(1);
    });

    it("shares one connection between subscribers", async function(){
      const hub = hubFor();
      await Promise.all(Array.from({length: 10}, ()=> hub.subscribe("all", new TestSink())));
      await hub.subscribe({user: user_id}, new TestSink());
      expect(hub.stats()).to.deep.equal({streams: 11, listening: true});
      expect(await backends()).to.have.length(1);
    });

    it("guarantees delivery of what's committed after subscribe() resolves", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      const task = await tasks.create({type: "testTask", data: {}});
      await until(()=> sink.events.length);
      expect(sink.events[0].task_id).to.equal(task.task_id);
    });

    it("keeps the connection through a brief absence of subscribers", async function(){
      const hub = hubFor({lingerMs: 60000});
      const unsubscribe = await hub.subscribe("all", new TestSink());
      const before = await backends();
      unsubscribe();
      await timers.setTimeout(20);
      expect(hub.stats()).to.deep.equal({streams: 0, listening: true});
      await hub.subscribe("all", new TestSink());
      expect(await backends()).to.deep.equal(before);
    });

    it("closes the connection once no subscriber is left for long enough", async function(){
      const hub = hubFor({lingerMs: 10});
      const first = await hub.subscribe("all", new TestSink());
      const second = await hub.subscribe("all", new TestSink());
      first();
      await timers.setTimeout(30);
      expect(hub.stats().listening, "one subscriber remains").to.be.true;
      second();
      await until(()=> !hub.stats().listening);
      await until(noBackend);
    });

    it("reconnects for a subscriber that comes after that", async function(){
      const hub = hubFor({lingerMs: 1});
      (await hub.subscribe("all", new TestSink()))();
      await until(()=> !hub.stats().listening);
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      await tasks.create({type: "testTask", data: {}});
      await until(()=> sink.events.length);
    });

    it("rejects subscribers if the database is unavailable", async function(){
      const hub = hubFor({uri: "postgres://localhost:1/nope"});
      const sink = new TestSink();
      await expect(hub.subscribe("all", sink)).to.be.rejected;
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
      expect(sink.ended, "was never subscribed").to.be.false;
    });
  });


  describe("routing", function(){
    it("sends a user's tasks to that user's subscribers", async function(){
      const hub = hubFor();
      const {received} = await barrier(hub);
      const mine = new TestSink(), other = new TestSink();
      await hub.subscribe({user: user_id}, mine);
      await hub.subscribe({user: other_user_id}, other);
      const task = await tasks.create({type: "testTask", data: {}, user_id});
      await received(1);
      expect(mine.events.map(e=> e.task_id)).to.deep.equal([task.task_id]);
      expect(other.frames).to.deep.equal([]);
    });

    it("sends a scene's tasks to that scene's subscribers", async function(){
      const hub = hubFor();
      const {received} = await barrier(hub);
      const mine = new TestSink(), other = new TestSink();
      await hub.subscribe({scene: scene_id}, mine);
      await hub.subscribe({scene: other_scene_id}, other);
      const task = await tasks.create({type: "testTask", data: {}, scene_id});
      await received(1);
      expect(mine.events.map(e=> e.task_id)).to.deep.equal([task.task_id]);
      expect(other.frames).to.deep.equal([]);
    });

    it("sends a task to all those concerned, once each", async function(){
      const hub = hubFor();
      const {received, sink: all} = await barrier(hub);
      const user = new TestSink(), scene = new TestSink();
      await hub.subscribe({user: user_id}, user);
      await hub.subscribe({scene: scene_id}, scene);
      await tasks.create({type: "testTask", data: {}, user_id, scene_id});
      await received(1);
      for(const sink of [user, scene, all]) expect(sink.events).to.have.length(1);
    });

    it("sends tasks with no owner or scene to the \"all\" subscribers only", async function(){
      const hub = hubFor();
      const {received, sink: all} = await barrier(hub);
      const user = new TestSink(), scene = new TestSink();
      await hub.subscribe({user: user_id}, user);
      await hub.subscribe({scene: scene_id}, scene);
      await tasks.create({type: "testTask", data: {}});
      await received(1);
      expect(all.events).to.have.length(1);
      expect(user.frames).to.deep.equal([]);
      expect(scene.frames).to.deep.equal([]);
    });

    it("stops sending after unsubscribing, which can be done twice", async function(){
      const hub = hubFor();
      const {received} = await barrier(hub);
      const sink = new TestSink();
      const unsubscribe = await hub.subscribe({user: user_id}, sink);
      unsubscribe();
      unsubscribe();
      expect(hub.stats().streams, "only the barrier is left").to.equal(1);
      await tasks.create({type: "testTask", data: {}, user_id});
      await received(1);
      expect(sink.frames).to.deep.equal([]);
      expect(sink.ended, "the sink belongs to the caller").to.be.false;
    });
  });


  describe("frames", function(){
    it("are valid server-sent events", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      const task = await tasks.create({type: "testTask", data: {}, user_id, scene_id});
      await until(()=> sink.frames.length);
      const [, data] = /^event: task\ndata: ([^\n]+)\n\n$/.exec(sink.frames[0]) ?? [];
      expect(JSON.parse(data)).to.deep.equal({
        task_id: task.task_id,
        parent: null,
        type: "testTask",
        status: "pending",
        scene_id,
        user_id,
      });
    });

    it("can't be broken by the content of a task's type", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      await tasks.create({type: "line\n\ndata: forged\n\n", data: {}});
      await until(()=> sink.frames.length);
      expect(sink.frames[0].match(/\n\n/g), "only the frame's terminator").to.have.length(1);
      expect(sink.events[0].type).to.equal("line\n\ndata: forged\n\n");
    });

    it("ignores malformed notifications", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      await handle.run(`SELECT pg_notify('task_events', 'not json')`);
      await handle.run(`SELECT pg_notify('task_events', '{"foo": "bar"}')`);
      await handle.run(`SELECT pg_notify('task_events', 'null')`);
      await tasks.create({type: "testTask", data: {}});
      await until(()=> sink.frames.length);
      expect(sink.events).to.have.length(1);
      expect(sink.events[0].type).to.equal("testTask");
    });
  });


  describe("inbox", function(){
    const notify = (uid: number, type = "testNotification")=> handle.run(`INSERT INTO notifications(fk_user_id, type) VALUES ($1, $2)`, [uid, type]);

    const signals = (sink: TestSink): NotificationEvent[]=> sink.frames
      .filter(f=> f.startsWith("event: notification\n"))
      .map(f=> JSON.parse(f.slice("event: notification\ndata: ".length)));

    it("sends a user's notifications to their inbox", async function(){
      const hub = hubFor();
      const mine = new TestSink(), theirs = new TestSink();
      await hub.subscribe({inbox: other_user_id}, theirs);
      await hub.subscribe({inbox: user_id}, mine);
      await notify(user_id);
      await until(()=> mine.frames.length);
      expect(signals(mine)).to.have.length(1);
      expect(signals(mine)[0]).to.include({user_id, type: "testNotification"});
      expect(theirs.frames).to.deep.equal([]);
    });

    it("doesn't send them to anyone else, including those watching that user's tasks", async function(){
      const hub = hubFor();
      const inbox = new TestSink(), user = new TestSink(), all = new TestSink();
      await hub.subscribe({inbox: user_id}, inbox);
      await hub.subscribe({user: user_id}, user);
      await hub.subscribe("all", all);
      await notify(user_id);
      await until(()=> inbox.frames.length);
      expect(user.frames).to.deep.equal([]);
      expect(all.frames).to.deep.equal([]);
    });

    it("doesn't send task events to an inbox", async function(){
      const hub = hubFor();
      const {received} = await barrier(hub);
      const inbox = new TestSink();
      await hub.subscribe({inbox: user_id}, inbox);
      await tasks.create({type: "testTask", data: {}, user_id});
      await received(1);
      expect(inbox.frames).to.deep.equal([]);
    });

    it("works alongside a task route on the same sink, each once", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe([{user: user_id}, {inbox: user_id}], sink);
      expect(hub.stats().streams, "it's one subscriber").to.equal(1);
      await tasks.create({type: "testTask", data: {}, user_id});
      await notify(user_id);
      await until(()=> sink.frames.length === 2);
      expect(sink.events).to.have.length(1);
      expect(signals(sink)).to.have.length(1);
    });

    it("gets a single heartbeat on a sink with two routes", async function(){
      const hub = hubFor({heartbeatMs: 20});
      const sink = new TestSink();
      await hub.subscribe([{user: user_id}, {inbox: user_id}], sink);
      await until(()=> sink.frames.length);
      expect(sink.frames.length, "the first round").to.equal(1);
    });

    it("stops on every route when unsubscribing", async function(){
      const hub = hubFor();
      const {received} = await barrier(hub);
      const sink = new TestSink();
      const unsubscribe = await hub.subscribe([{user: user_id}, {inbox: user_id}], sink);
      unsubscribe();
      expect(hub.stats().streams, "the barrier").to.equal(1);
      await tasks.create({type: "testTask", data: {}, user_id});
      await received(1);
      await notify(user_id);
      expect(sink.frames).to.deep.equal([]);
    });

    it("drops a slow subscriber from every route", async function(){
      const hub = hubFor({maxBufferBytes: 100});
      const {received} = await barrier(hub);
      const slow = new TestSink();
      slow.writableLength = 101;
      await hub.subscribe([{user: user_id}, {inbox: user_id}], slow);
      await tasks.create({type: "testTask", data: {}, user_id});
      await received(1);
      expect(slow.destroyed).to.be.true;
      const count = slow.frames.length;
      await tasks.create({type: "testTask", data: {}, user_id});
      await received(2);
      expect(slow.frames.length).to.equal(count);
    });

    it("ignores malformed notifications", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      const all = new TestSink();
      await hub.subscribe({inbox: user_id}, sink);
      await hub.subscribe("all", all);
      await handle.run(`SELECT pg_notify('notifications', 'not json')`);
      await handle.run(`SELECT pg_notify('notifications', $1)`, [JSON.stringify({user_id})]);
      await handle.run(`SELECT pg_notify('notifications', $1)`, [JSON.stringify({notification_id: 1})]);
      //A task's event on the wrong channel: it's not anything we know
      await handle.run(`SELECT pg_notify('notifications', $1)`, [JSON.stringify({task_id: 1, user_id})]);
      await notify(user_id);
      await until(()=> sink.frames.length);
      expect(signals(sink)).to.have.length(1);
      expect(signals(sink)[0].type).to.equal("testNotification");
      expect(all.frames).to.deep.equal([]);
    });
  });


  describe("heartbeat", function(){
    it("reaches every subscriber", async function(){
      const hub = hubFor({heartbeatMs: 5});
      const user = new TestSink(), all = new TestSink();
      await hub.subscribe({user: user_id}, user);
      await hub.subscribe("all", all);
      await until(()=> user.frames.length && all.frames.length);
      expect(user.frames[0]).to.equal(": ping\n\n");
      expect(all.frames[0]).to.equal(": ping\n\n");
    });

    it("carries on when one of several subscribers leaves", async function(){
      const hub = hubFor({heartbeatMs: 5});
      const unsubscribe = await hub.subscribe("all", new TestSink());
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      unsubscribe();
      await until(()=> sink.frames.length);
    });

    it("resumes for a subscriber arriving after the last one left", async function(){
      const hub = hubFor({heartbeatMs: 5});
      (await hub.subscribe("all", new TestSink()))();
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      await until(()=> sink.frames.length);
    });
  });


  describe("bad subscribers", function(){
    it("drops a slow one on an event, leaving the others alone", async function(){
      const hub = hubFor({maxBufferBytes: 100});
      const {received} = await barrier(hub);
      const slow = new TestSink(), other = new TestSink();
      slow.writableLength = 101;
      await hub.subscribe({user: user_id}, slow);
      await hub.subscribe({user: user_id}, other);
      await tasks.create({type: "testTask", data: {}, user_id});
      await received(1);
      expect(slow.destroyed).to.be.true;
      expect(other.destroyed).to.be.false;
      expect(other.events).to.have.length(1);
      expect(hub.stats().streams).to.equal(2);
    });

    it("drops a slow one on a heartbeat", async function(){
      const hub = hubFor({maxBufferBytes: 100, heartbeatMs: 5});
      const slow = new TestSink();
      slow.writableLength = 101;
      await hub.subscribe("all", slow);
      await until(()=> slow.destroyed);
      expect(hub.stats().streams).to.equal(0);
    });

    it("keeps one at the limit", async function(){
      const hub = hubFor({maxBufferBytes: 100, heartbeatMs: 5});
      const sink = new TestSink();
      sink.writableLength = 100;
      await hub.subscribe("all", sink);
      await until(()=> sink.frames.length);
      expect(sink.destroyed).to.be.false;
    });

    it("survives one that throws", async function(){
      const hub = hubFor();
      const {received} = await barrier(hub);
      class ThrowingSink extends TestSink{
        write(){ throw new Error("Failed to write"); }
        destroy(){ throw new Error("Failed to destroy"); }
      }
      const bad = new ThrowingSink(), good = new TestSink();
      await hub.subscribe({user: user_id}, bad);
      await hub.subscribe({user: user_id}, good);
      await tasks.create({type: "testTask", data: {}, user_id});
      await received(1);
      expect(good.events).to.have.length(1);
      expect(hub.stats().streams, "good and the barrier").to.equal(2);
    });
  });


  describe("limits", function(){
    it("refuses subscribers beyond the limit per owner, until one leaves", async function(){
      const hub = hubFor({maxStreamsPerOwner: 2});
      const first = await hub.subscribe("all", new TestSink(), {owner: 1});
      await hub.subscribe("all", new TestSink(), {owner: 1});
      const refused = new TestSink();
      await expect(hub.subscribe("all", refused, {owner: 1})).to.be.rejectedWith("[429]");
      expect(hub.stats().streams).to.equal(2);

      await hub.subscribe("all", new TestSink(), {owner: 2});
      first();
      await hub.subscribe("all", new TestSink(), {owner: 1});
      expect(hub.stats().streams).to.equal(3);
    });

    it("doesn't apply the limit per owner to subscribers without one", async function(){
      const hub = hubFor({maxStreamsPerOwner: 1});
      await hub.subscribe("all", new TestSink());
      await hub.subscribe("all", new TestSink());
      expect(hub.stats().streams).to.equal(2);
    });

    it("refuses subscribers beyond the global limit, until one leaves", async function(){
      const hub = hubFor({maxStreams: 2});
      const first = await hub.subscribe("all", new TestSink(), {owner: 1});
      await hub.subscribe("all", new TestSink());
      await expect(hub.subscribe("all", new TestSink(), {owner: 2})).to.be.rejectedWith("[503]");
      first();
      await hub.subscribe("all", new TestSink(), {owner: 2});
    });

    it("gives slots back when a subscriber is dropped", async function(){
      const hub = hubFor({maxStreamsPerOwner: 1, maxBufferBytes: 100, heartbeatMs: 5});
      const slow = new TestSink();
      slow.writableLength = 101;
      await hub.subscribe("all", slow, {owner: 1});
      await until(()=> slow.destroyed);
      await hub.subscribe("all", new TestSink(), {owner: 1});
    });

    it("gives slots back when the connection is lost", async function(){
      const hub = hubFor({maxStreamsPerOwner: 1});
      await hub.subscribe("all", new TestSink(), {owner: 1});
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> !hub.stats().listening);
      await hub.subscribe("all", new TestSink(), {owner: 1});
    });
  });


  describe("connection loss", function(){
    it("ends subscribers when the server closes the connection", async function(){
      const hub = hubFor();
      const user = new TestSink(), all = new TestSink();
      await hub.subscribe({user: user_id}, user);
      await hub.subscribe("all", all);
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> user.ended && all.ended);
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
    });

    it("recovers when subscribers come back", async function(){
      const hub = hubFor();
      await hub.subscribe("all", new TestSink());
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> !hub.stats().listening);

      const sink = new TestSink();
      await hub.subscribe({user: user_id}, sink);
      expect(await backends()).to.have.length(1);
      await tasks.create({type: "testTask", data: {}, user_id});
      await until(()=> sink.events.length);
    });

    it("doesn't end a sink that had unsubscribed", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      (await hub.subscribe("all", sink))();
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> !hub.stats().listening);
      expect(sink.ended).to.be.false;
    });

    it("leaves the count right when an ended subscriber unsubscribes late", async function(){
      //What a request's "close" handler does after the hub ended its response
      const hub = hubFor();
      const unsubscribe = await hub.subscribe("all", new TestSink());
      const [pid] = await backends();
      await handle.run(`SELECT pg_terminate_backend($1)`, [pid]);
      await until(()=> !hub.stats().listening);

      await hub.subscribe("all", new TestSink());
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
      const hub = hubFor({uri: proxy.uri, healthCheckMs: 10, healthCheckTimeoutMs: 20});
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      await timers.setTimeout(50);
      expect(sink.ended, "the connection is working").to.be.false;
      proxy.silence();
      await until(()=> sink.ended);
      expect(hub.stats().listening).to.be.false;
    });

    it("close() doesn't hang on a silent connection", async function(){
      const proxy = await silentProxy();
      const hub = hubFor({uri: proxy.uri});
      await hub.subscribe("all", new TestSink());
      proxy.silence();
      await hub.close();
    });
  });


  describe("close()", function(){
    it("ends subscribers and disconnects", async function(){
      const hub = hubFor();
      const sink = new TestSink();
      await hub.subscribe("all", sink);
      await hub.close();
      expect(sink.ended).to.be.true;
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
      await until(noBackend);
    });

    it("can be called twice", async function(){
      const hub = hubFor();
      await hub.subscribe("all", new TestSink());
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
      await expect(hub.subscribe("all", new TestSink())).to.be.rejectedWith("closed");
    });

    it("rejects a subscriber that was connecting and leaves no connection behind", async function(){
      const hub = hubFor();
      const subscribing = hub.subscribe("all", new TestSink());
      await hub.close();
      await expect(subscribing).to.be.rejectedWith("closed");
      expect(hub.stats()).to.deep.equal({streams: 0, listening: false});
      await until(noBackend);
    });
  });


  describe("createService()", function(){
    let uri: string, dir: string;
    this.beforeEach(async function(){
      uri = await getUniqueDb("ecorpus_task_event_service_tests");
      dir = await fs.mkdtemp(path.join(tmpdir(), "ecorpus_task_event_service_tests"));
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
        expect(services.app.locals.events).to.equal(services.events);
        expect(services.events.stats().listening, "lazily").to.be.false;

        const sink = new TestSink();
        await services.events.subscribe("all", sink);
        await services.taskScheduler.create({type: "testTask", data: {}});
        await until(()=> sink.events.length);

        await services.close();
        closed = true;
        expect(sink.ended).to.be.true;
        expect(services.events.stats().listening).to.be.false;
      }finally{
        if(!closed) await services.close();
      }
    });
  });
});
