import { Client } from "pg";

import { HTTPError } from "../utils/errors.js";
import { localize } from "../utils/i18n.js";
import { createLogger } from "../utils/log/index.js";
import { TaskEvent } from "./types.js";

const log = createLogger("events");

/** Channels fed by the triggers on the tasks and notifications tables. See migration 010 */
const TASKS_CHANNEL = "task_events";
const NOTIFICATIONS_CHANNEL = "notifications";
/** Identifies the listener's backend in `pg_stat_activity` */
const APPLICATION_NAME = "ecorpus:events";

const HEARTBEAT_FRAME = ": ping\n\n";

/**
 * A notification was created. This is only a signal:
 * its text depends on the language of whoever reads it, and frames are the same for all.
 */
export interface NotificationEvent{
  notification_id: number;
  user_id: number;
  type: string;
}

/**
 * Tasks are sent to the subscribers of their owner, of their scene, and of "all".
 * Notifications are only sent to the subscribers of their recipient's inbox.
 */
export type EventKey = {user: number}|{scene: number}|{inbox: number}|"all";

/**
 * Where a subscriber's events get written. An express `Response` is one.
 */
export interface EventSink{
  write(frame: string): unknown;
  end(): unknown;
  destroy(): unknown;
  readonly writableLength: number;
}

export interface EventHubOptions{
  uri: string;
  /** How long to keep the connection open with no subscribers. A full-page navigation briefly leaves a user with none. */
  lingerMs?: number;
  /** Delay between heartbeats, which keep idle streams from being closed along the way and detect dead sockets */
  heartbeatMs?: number;
  /** Delay between checks of the database connection */
  healthCheckMs?: number;
  /** How long a check may take before the connection is considered dead */
  healthCheckTimeoutMs?: number;
  /** A subscriber with more unsent bytes than this is dropped */
  maxBufferBytes?: number;
  /** Subscribers beyond this are refused */
  maxStreams?: number;
  /** Subscribers beyond this are refused, for a given owner */
  maxStreamsPerOwner?: number;
}

export interface EventSubscribeOptions{
  /** Who this subscription counts against (a user ID) */
  owner?: number;
}

interface Subscription{
  routes: string[];
  owner?: number;
}

function routeOf(key: EventKey): string{
  if(key === "all") return "all";
  if("user" in key) return `user:${key.user}`;
  return "scene" in key ? `scene:${key.scene}` : `inbox:${key.inbox}`;
}

/**
 * Relays task events from a single `LISTEN` connection to any number of subscribers.
 *
 * The connection only exists while it's needed: it opens with the first subscriber and
 * closes some time after the last one leaves.
 *
 * Events are not persisted and nothing replays them. When the connection is lost, subscribers
 * get ended, and it's up to them to subscribe again and read the current state from the tasks
 * table. That's the same thing they have to do after a server restart, so there is only one
 * recovery path, and no retry loop here to hammer an unavailable database with nobody listening.
 */
export class EventHub{
  readonly #uri: string;
  readonly #lingerMs: number;
  readonly #heartbeatMs: number;
  readonly #healthCheckMs: number;
  readonly #healthCheckTimeoutMs: number;
  readonly #maxBufferBytes: number;
  readonly #maxStreams: number;
  readonly #maxStreamsPerOwner: number;

  #client: Client|null = null;
  #connecting: Promise<Client>|null = null;
  #routes = new Map<string, Set<EventSink>>();
  #subscriptions = new Map<EventSink, Subscription>();
  #streamsPerOwner = new Map<number, number>();
  #closing: Promise<void>|null = null;

  #lingerTimer: NodeJS.Timeout|null = null;
  #heartbeatTimer: NodeJS.Timeout|null = null;
  #healthTimer: NodeJS.Timeout|null = null;

  constructor({
    uri,
    lingerMs = 5*60*1000,
    heartbeatMs = 30*1000,
    healthCheckMs = 60*1000,
    healthCheckTimeoutMs = 10*1000,
    maxBufferBytes = 64*1024,
    maxStreams = 4000,
    maxStreamsPerOwner = 8,
  }: EventHubOptions){
    this.#uri = uri;
    this.#lingerMs = lingerMs;
    this.#heartbeatMs = heartbeatMs;
    this.#healthCheckMs = healthCheckMs;
    this.#healthCheckTimeoutMs = healthCheckTimeoutMs;
    this.#maxBufferBytes = maxBufferBytes;
    this.#maxStreams = maxStreams;
    this.#maxStreamsPerOwner = maxStreamsPerOwner;
  }

  stats(): {streams: number, listening: boolean}{
    return {streams: this.#subscriptions.size, listening: this.#client !== null};
  }

  /**
   * Starts sending events matching `keys` to `sink`.
   *
   * It resolves once events are flowing, so anything committed after that is guaranteed to reach
   * the sink: that's when a caller should read the current state.
   * @returns a function to stop the subscription. It does not end the sink.
   * @throws if the database can't be reached. No retry is made.
   * @throws {HTTPError} if there are too many subscribers: a 429 for this owner, a 503 for this process.
   * Refusing the newcomer rather than evicting the oldest is deliberate: an evicted subscriber
   * would reconnect and evict the next one, and a user's tabs would keep taking turns forever.
   */
  async subscribe(keys: EventKey|EventKey[], sink: EventSink, {owner}: EventSubscribeOptions = {}): Promise<()=>void>{
    if(this.#closing) throw new Error("EventHub is closed");
    this.#clearTimer("linger");
    const client = await this.#listen();
    if(this.#closing || this.#client !== client){
      throw new Error("Task events connection was lost while subscribing");
    }
    if(this.#maxStreams <= this.#subscriptions.size){
      throw new HTTPError(503, localize("errors.serviceUnavailable"));
    }
    if(owner !== undefined && this.#maxStreamsPerOwner <= (this.#streamsPerOwner.get(owner) ?? 0)){
      throw new HTTPError(429, localize("errors.tooManyRequests"));
    }

    const routes = [keys].flat().map(routeOf);
    for(const route of routes){
      let sinks = this.#routes.get(route);
      if(!sinks) this.#routes.set(route, sinks = new Set());
      sinks.add(sink);
    }
    this.#subscriptions.set(sink, {routes, owner});
    if(owner !== undefined) this.#streamsPerOwner.set(owner, (this.#streamsPerOwner.get(owner) ?? 0) + 1);
    this.#heartbeatTimer ??= setInterval(()=> this.#heartbeat(), this.#heartbeatMs).unref();
    return ()=> this.#unsubscribe(sink);
  }

  /**
   * Ends all subscribers and closes the connection. A closed hub can't be used again.
   */
  close(): Promise<void>{
    return this.#closing ??= this.#close();
  }

  async #close(){
    this.#clearTimer("linger");
    this.#clearTimer("health");
    this.#endAll();
    await this.#connecting?.catch(()=>{});
    const client = this.#client;
    this.#client = null;
    if(client) await this.#disconnect(client);
  }

  /** Waits for the connection to close, within reason: one that has gone silent might never acknowledge it. */
  async #disconnect(client: Client){
    let timer: NodeJS.Timeout|undefined;
    await Promise.race([
      client.end().catch(()=>{}),
      new Promise<void>((resolve)=>{ timer = setTimeout(resolve, 1000).unref(); }),
    ]);
    clearTimeout(timer);
  }

  #listen(): Promise<Client>{
    if(this.#client) return Promise.resolve(this.#client);
    return this.#connecting ??= this.#connect().finally(()=>{ this.#connecting = null; });
  }

  async #connect(): Promise<Client>{
    const client = new Client({
      connectionString: this.#uri,
      application_name: APPLICATION_NAME,
      connectionTimeoutMillis: 10000,
      //Applies to LISTEN too: if it could hang, all subscribers would be stuck waiting on this connection.
      query_timeout: this.#healthCheckTimeoutMs,
      keepAlive: true,
      keepAliveInitialDelayMillis: 30000,
    });
    //An unhandled "error" event would take the process down.
    //These stay attached for the client's lifetime: #onConnectionLost ignores a client it doesn't use.
    client.on("error", (err)=> this.#onConnectionLost(client, err));
    client.on("end", ()=> this.#onConnectionLost(client));
    client.on("notification", ({channel, payload})=> this.#dispatch(channel, payload));
    try{
      await client.connect();
      await client.query(`LISTEN ${TASKS_CHANNEL}; LISTEN ${NOTIFICATIONS_CHANNEL}`);
      if(this.#closing) throw new Error("EventHub is closed");
    }catch(e){
      await this.#disconnect(client);
      throw e;
    }
    log.debug("Listening for task events");
    this.#client = client;
    this.#healthTimer = setInterval(()=> this.#checkHealth(client), this.#healthCheckMs).unref();
    return client;
  }

  #onConnectionLost(client: Client, err?: Error){
    if(this.#client !== client) return;
    log.warn({err}, "Lost the task events connection. Ending subscribers.");
    this.#client = null;
    this.#clearTimer("health");
    this.#clearTimer("linger");
    this.#endAll();
    this.#disconnect(client);
  }

  /**
   * The channel can stay quiet for days, so a connection that silently died would otherwise go
   * unnoticed, and every subscriber would wait for events that will never come.
   */
  #checkHealth(client: Client){
    client.query("SELECT 1").catch((err)=> this.#onConnectionLost(client, err));
  }

  #dispatch(channel: string, payload: string|undefined){
    let parsed: Partial<TaskEvent & NotificationEvent>|null|undefined;
    try{
      parsed = JSON.parse(payload ?? "");
    }catch(e){
      //Handled below
    }
    //Frames are rendered once, whatever the number of subscribers. JSON has no raw line breaks, so it's a valid data field.
    if(channel === NOTIFICATIONS_CHANNEL && typeof parsed?.notification_id === "number" && typeof parsed.user_id === "number"){
      this.#deliver(`inbox:${parsed.user_id}`, `event: notification\ndata: ${payload}\n\n`);
      return;
    }
    if(channel !== TASKS_CHANNEL || typeof parsed?.task_id !== "number"){
      log.warn({channel, payload}, "Ignored a malformed event");
      return;
    }
    const event = parsed as TaskEvent;
    const frame = `event: task\ndata: ${payload}\n\n`;
    if(event.user_id !== null) this.#deliver(`user:${event.user_id}`, frame);
    if(event.scene_id !== null) this.#deliver(`scene:${event.scene_id}`, frame);
    this.#deliver("all", frame);
  }

  #deliver(route: string, frame: string){
    const sinks = this.#routes.get(route);
    if(!sinks) return;
    for(const sink of sinks){
      this.#write(sink, frame);
    }
  }

  /**
   * One bad subscriber can't get in the way of the others: it gets dropped.
   * It will have to resynchronize when it reconnects, which is all it would get from its backlog.
   */
  #write(sink: EventSink, frame: string){
    try{
      sink.write(frame);
      if(sink.writableLength <= this.#maxBufferBytes) return;
      log.debug("Dropped a slow task events subscriber");
    }catch(err){
      log.warn({err}, "Dropped a failing task events subscriber");
    }
    this.#unsubscribe(sink);
    try{
      sink.destroy();
    }catch(err){
      log.warn({err}, "Failed to destroy a task events subscriber");
    }
  }

  #heartbeat(){
    for(const sink of this.#subscriptions.keys()){
      this.#write(sink, HEARTBEAT_FRAME);
    }
  }

  #unsubscribe(sink: EventSink){
    const subscription = this.#subscriptions.get(sink);
    if(!subscription) return;
    const {routes, owner} = subscription;
    this.#subscriptions.delete(sink);
    for(const route of routes){
      const sinks = this.#routes.get(route)!;
      sinks.delete(sink);
      if(!sinks.size) this.#routes.delete(route);
    }
    if(owner !== undefined){
      const count = this.#streamsPerOwner.get(owner)! - 1;
      if(count) this.#streamsPerOwner.set(owner, count);
      else this.#streamsPerOwner.delete(owner);
    }
    if(this.#subscriptions.size) return;
    this.#clearTimer("heartbeat");
    this.#scheduleDisconnect();
  }

  #scheduleDisconnect(){
    if(this.#closing || !this.#client) return;
    this.#clearTimer("linger");
    this.#lingerTimer = setTimeout(()=>{
      this.#lingerTimer = null;
      const client = this.#client;
      if(!client || this.#subscriptions.size) return;
      log.debug("No more task events subscribers. Closing the connection.");
      this.#client = null;
      this.#clearTimer("health");
      this.#disconnect(client);
    }, this.#lingerMs).unref();
  }

  #endAll(){
    const sinks = [...this.#subscriptions.keys()];
    this.#routes.clear();
    this.#subscriptions.clear();
    this.#streamsPerOwner.clear();
    this.#clearTimer("heartbeat");
    for(const sink of sinks){
      try{
        sink.end();
      }catch(err){
        log.warn({err}, "Failed to end a task events subscriber");
      }
    }
  }

  #clearTimer(name: "linger"|"heartbeat"|"health"){
    if(name === "linger"){
      if(this.#lingerTimer) clearTimeout(this.#lingerTimer);
      this.#lingerTimer = null;
    }else if(name === "heartbeat"){
      if(this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }else{
      if(this.#healthTimer) clearInterval(this.#healthTimer);
      this.#healthTimer = null;
    }
  }
}
