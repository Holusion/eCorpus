import { Client } from "pg";

import { BadRequestError, HTTPError } from "../utils/errors.js";
import { localize } from "../utils/i18n.js";
import { createLogger } from "../utils/log/index.js";
import { DatabaseHandle } from "../vfs/helpers/db.js";
import { TaskDefinition } from "../tasks/types.js";
import { NotificationItem } from "./types.js";

const log = createLogger("notifications");

/** Channel fed by the triggers on the notifications and tasks tables. See migration 010 */
const CHANNEL = "notifications";
/** Identifies the listener's backend in `pg_stat_activity` */
const APPLICATION_NAME = "ecorpus:notifications";

/** An event rather than a comment: browsers' EventSource doesn't show comments, and it's how a client can tell the stream is still alive. */
const HEARTBEAT_FRAME = "event: ping\ndata:\n\n";

/**
 * Where a subscriber's frames get written. An express `Response` is one.
 */
export interface NotificationSink{
  write(frame: string): unknown;
  end(): unknown;
  destroy(): unknown;
  readonly writableLength: number;
}

export interface NotificationManagerOptions{
  /** For queries */
  db: DatabaseHandle;
  /** For the `LISTEN` connection, which can't be one of a pool's */
  uri: string;
  /** How long to keep the connection open with no subscribers, as for `pg.Pool`. */
  idleTimeoutMillis?: number;
  /** Delay between heartbeats, which keep idle streams from being closed and detect dead sockets */
  heartbeatMillis?: number;
  /** Delay between checks of the database connection */
  healthCheckMillis?: number;
  /** How long a check may take before the connection is considered dead */
  healthCheckTimeoutMillis?: number;
  /** A subscriber with more unsent bytes than this is dropped */
  maxBufferBytes?: number;
  /** Subscribers beyond this are refused */
  maxStreams?: number;
  /** Subscribers beyond this are refused, for a given user */
  maxStreamsPerUser?: number;
}

export interface NotificationSubscribeOptions{
  /** Who this subscription counts against, if not the user being watched (eg. an admin) */
  owner?: number;
}

interface Subscription{
  user_id: number;
  owner: number;
}

/**
 * Manages notifications: creates and lists them, and relays their changes from a single `LISTEN`
 * connection to any number of subscribers, each watching one user.
 *
 * The connection only exists while it's needed: it opens with the first subscriber and
 * closes some time after the last one leaves.
 *
 */
export class NotificationManager{
  readonly #db: DatabaseHandle;
  readonly #uri: string;
  readonly #idleTimeoutMillis: number;
  readonly #heartbeatMillis: number;
  readonly #healthCheckMillis: number;
  readonly #healthCheckTimeoutMillis: number;
  readonly #maxBufferBytes: number;
  readonly #maxStreams: number;
  readonly #maxStreamsPerUser: number;

  #client: Client|null = null;
  #connecting: Promise<Client>|null = null;
  #users = new Map<number, Set<NotificationSink>>();
  #subscriptions = new Map<NotificationSink, Subscription>();
  #streamsPerOwner = new Map<number, number>();
  #closing: Promise<void>|null = null;

  #idleTimer: NodeJS.Timeout|null = null;
  #heartbeatTimer: NodeJS.Timeout|null = null;
  #healthTimer: NodeJS.Timeout|null = null;

  constructor({
    db,
    uri,
    idleTimeoutMillis = 5*60*1000,
    heartbeatMillis = 30*1000,
    healthCheckMillis = 60*1000,
    healthCheckTimeoutMillis = 10*1000,
    maxBufferBytes = 64*1024,
    maxStreams = 4000,
    maxStreamsPerUser = 8,
  }: NotificationManagerOptions){
    if(!db) throw new Error("A valid database handle is required to instanciate a NotificationManager");
    this.#db = db;
    this.#uri = uri;
    this.#idleTimeoutMillis = idleTimeoutMillis;
    this.#heartbeatMillis = heartbeatMillis;
    this.#healthCheckMillis = healthCheckMillis;
    this.#healthCheckTimeoutMillis = healthCheckTimeoutMillis;
    this.#maxBufferBytes = maxBufferBytes;
    this.#maxStreams = maxStreams;
    this.#maxStreamsPerUser = maxStreamsPerUser;
  }

  stats(): {streams: number, listening: boolean}{
    return {streams: this.#subscriptions.size, listening: this.#client !== null};
  }

  /**
   * Notify a task's user about it: running until it settles, then unread.
   * Call it before the task starts, so it can't settle unnoticed. Does nothing if they're already notified.
   * @throws if the task has no user
   */
  public async notify({task_id, user_id, type}: Pick<TaskDefinition, "task_id"|"user_id"|"type">): Promise<void>{
    if(user_id == null) throw new Error(`Can't notify about task #${task_id} (${type}): it has no user`);
    await this.#db.run(`
      INSERT INTO notifications(fk_user_id, fk_task_id, type)
      VALUES ($1, $2, $3)
      ON CONFLICT (fk_task_id, fk_user_id) DO NOTHING
    `, [user_id, task_id, type]);
  }

  /**
   * Checks a `limit` from a request, the same way as other lists: 20 by default, at most 100.
   * Exposed for callers that need to validate it before doing anything else.
   * @throws {BadRequestError}
   */
  public static notificationsLimit(limit: number = 20): number{
    if(typeof limit !== "number" || !Number.isInteger(limit) || limit <= 0) throw new BadRequestError(`When provided, limit must be a positive integer`);
    if(limit > 100) throw new BadRequestError(`When provided, limit must be <= 100`);
    return limit;
  }

  /**
   * Some of a user's notifications: those whose task hasn't settled first, then newest first (see `mtime`).
   * Changes move them: an offset only holds as long as nothing does, which is good enough to look further.
   * @param unreadOnly leaves out those that have been read
   * @param types only those of these types
   * @throws {BadRequestError} if `limit` or `offset` aren't integers, or are out of range
   */
  public async getNotifications(user_id: number, {
    limit = 20,
    offset = 0,
    unreadOnly = false,
    types,
  }: {limit?: number, offset?: number, unreadOnly?: boolean, types?: string[]} = {}): Promise<NotificationItem[]>{
    if(!Number.isInteger(limit) || limit <= 0) throw new BadRequestError(`limit must be a positive integer`);
    if(!Number.isInteger(offset) || offset < 0) throw new BadRequestError(`offset must be a non-negative integer`);
    const filters = `n.fk_user_id = $1
      AND (NOT $4 OR NOT n.read)
      AND ($5::text[] IS NULL OR n.type = ANY($5::text[]))`;
    // Each side takes no more than the page needs, so both can follow an index.
    // `notification_item()` is only called on the rows that are returned, not those the offset skips.
    // The unsettled status must be written as in `idx_tasks_unsettled` for it to be used.

    const rows = await this.#db.all<{item: NotificationItem}>(`
      SELECT notification_item(p.n) AS item FROM (
        SELECT u.* FROM (
          (SELECT n, false AS settled, n.mtime, n.notification_id
             FROM notifications n JOIN tasks t ON t.task_id = n.fk_task_id
            WHERE t.status NOT IN ('success', 'error') AND ${filters}
            ORDER BY n.mtime DESC, n.notification_id DESC
            LIMIT $2::int + $3::int)
          UNION ALL
          (SELECT n, true AS settled, n.mtime, n.notification_id
             FROM notifications n LEFT JOIN tasks t ON t.task_id = n.fk_task_id
            WHERE (t.status IS NULL OR t.status IN ('success', 'error')) AND ${filters}
            ORDER BY n.mtime DESC, n.notification_id DESC
            LIMIT $2::int + $3::int)
        ) u
        ORDER BY u.settled, u.mtime DESC, u.notification_id DESC
        LIMIT $2::int OFFSET $3::int
      ) p
      ORDER BY p.settled, p.mtime DESC, p.notification_id DESC
    `, [user_id, limit, offset, unreadOnly, types ?? null]);
    return rows.map(r=> r.item);
  }

  /**
   * Marks some of a user's notifications as read, by id. Ids that aren't theirs, or that don't exist, are ignored.
   * Only those that weren't read already change, and signal it.
   * @returns how many were marked
   */
  public async markRead(user_id: number, ids: number[]): Promise<number>{
    if(!ids.length) return 0;
    const {changes} = await this.#db.run(`
      UPDATE notifications SET read = true
       WHERE fk_user_id = $1 AND notification_id = ANY($2::bigint[]) AND NOT read
    `, [user_id, ids]);
    return changes ?? 0;
  }

  /**
   * Starts sending changes to `user_id`'s notifications to `sink`.
   *
   * It resolves once changes are flowing, so anything committed after that is guaranteed to reach
   * the sink: that's when a caller should read the current state.
   * @returns a function to stop the subscription. It does not end the sink.
   * @throws if the database can't be reached. No retry is made.
   * @throws {HTTPError} if there are too many subscribers: a 429 for this owner, a 503 for this process.
   * Refusing the newcomer rather than evicting the oldest is deliberate: an evicted subscriber
   * would reconnect and evict the next one, and a user's tabs would keep taking turns forever.
   */
  async subscribe(user_id: number, sink: NotificationSink, {owner = user_id}: NotificationSubscribeOptions = {}): Promise<()=>void>{
    if(this.#closing) throw new Error("NotificationManager is closed");
    this.#clearTimer("idle");
    const client = await this.#listen();
    if(this.#closing || this.#client !== client){
      throw new Error("Notifications connection was lost while subscribing");
    }
    if(this.#maxStreams <= this.#subscriptions.size){
      throw new HTTPError(503, localize("errors.serviceUnavailable"));
    }
    if(this.#maxStreamsPerUser <= (this.#streamsPerOwner.get(owner) ?? 0)){
      throw new HTTPError(429, localize("errors.tooManyRequests"));
    }

    let sinks = this.#users.get(user_id);
    if(!sinks) this.#users.set(user_id, sinks = new Set());
    sinks.add(sink);
    this.#subscriptions.set(sink, {user_id, owner});
    this.#streamsPerOwner.set(owner, (this.#streamsPerOwner.get(owner) ?? 0) + 1);
    this.#heartbeatTimer ??= setInterval(()=> this.#heartbeat(), this.#heartbeatMillis).unref();
    return ()=> this.#unsubscribe(sink);
  }

  /**
   * Ends all subscribers and closes the connection. A closed manager can't be used again.
   */
  close(): Promise<void>{
    return this.#closing ??= this.#close();
  }

  async #close(){
    this.#clearTimer("idle");
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
      query_timeout: this.#healthCheckTimeoutMillis,
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
      await client.query(`LISTEN ${CHANNEL}`);
      if(this.#closing) throw new Error("NotificationManager is closed");
    }catch(e){
      await this.#disconnect(client);
      throw e;
    }
    log.debug("Listening for notifications");
    this.#client = client;
    this.#healthTimer = setInterval(()=> this.#checkHealth(client), this.#healthCheckMillis).unref();
    return client;
  }

  #onConnectionLost(client: Client, err?: Error){
    if(this.#client !== client) return;
    log.warn({err}, "Lost the notifications connection. Ending subscribers.");
    this.#client = null;
    this.#clearTimer("health");
    this.#clearTimer("idle");
    this.#endAll();
    this.#disconnect(client);
  }

  /**
   * The channel can stay quiet for days, so a connection that silently died would otherwise go
   * unnoticed, and every subscriber would wait for changes that will never come.
   */
  #checkHealth(client: Client){
    client.query("SELECT 1").catch((err)=> this.#onConnectionLost(client, err));
  }

  #dispatch(channel: string, payload: string|undefined){
    let parsed: {user_id?: unknown, item?: unknown}|null|undefined;
    try{
      parsed = JSON.parse(payload ?? "");
    }catch(e){
      //Handled below
    }
    if(channel !== CHANNEL || typeof parsed?.user_id !== "number" || typeof parsed.item !== "object" || !parsed.item){
      log.warn({channel, payload}, "Ignored a malformed notification signal");
      return;
    }
    const sinks = this.#users.get(parsed.user_id);
    if(!sinks) return;
    //Rendered once, whatever the number of subscribers. JSON has no raw line breaks, so it's a valid data field.
    const frame = `event: notification\ndata: ${JSON.stringify(parsed.item)}\n\n`;
    for(const sink of sinks){
      this.#write(sink, frame);
    }
  }

  /**
   * One bad subscriber can't get in the way of the others: it gets dropped.
   * It will have to resynchronize when it reconnects, which is all it would get from its backlog.
   */
  #write(sink: NotificationSink, frame: string){
    try{
      sink.write(frame);
      if(sink.writableLength <= this.#maxBufferBytes) return;
      log.debug("Dropped a slow notifications subscriber");
    }catch(err){
      log.warn({err}, "Dropped a failing notifications subscriber");
    }
    this.#unsubscribe(sink);
    try{
      sink.destroy();
    }catch(err){
      log.warn({err}, "Failed to destroy a notifications subscriber");
    }
  }

  #heartbeat(){
    for(const sink of this.#subscriptions.keys()){
      this.#write(sink, HEARTBEAT_FRAME);
    }
  }

  #unsubscribe(sink: NotificationSink){
    const subscription = this.#subscriptions.get(sink);
    if(!subscription) return;
    const {user_id, owner} = subscription;
    this.#subscriptions.delete(sink);
    const sinks = this.#users.get(user_id)!;
    sinks.delete(sink);
    if(!sinks.size) this.#users.delete(user_id);
    const count = this.#streamsPerOwner.get(owner)! - 1;
    if(count) this.#streamsPerOwner.set(owner, count);
    else this.#streamsPerOwner.delete(owner);
    if(this.#subscriptions.size) return;
    this.#clearTimer("heartbeat");
    this.#scheduleDisconnect();
  }

  #scheduleDisconnect(){
    if(this.#closing || !this.#client) return;
    this.#clearTimer("idle");
    this.#idleTimer = setTimeout(()=>{
      this.#idleTimer = null;
      const client = this.#client;
      if(!client || this.#subscriptions.size) return;
      log.debug("No more notifications subscribers. Closing the connection.");
      this.#client = null;
      this.#clearTimer("health");
      this.#disconnect(client);
    }, this.#idleTimeoutMillis).unref();
  }

  #endAll(){
    const sinks = [...this.#subscriptions.keys()];
    this.#users.clear();
    this.#subscriptions.clear();
    this.#streamsPerOwner.clear();
    this.#clearTimer("heartbeat");
    for(const sink of sinks){
      try{
        sink.end();
      }catch(err){
        log.warn({err}, "Failed to end a notifications subscriber");
      }
    }
  }

  #clearTimer(name: "idle"|"heartbeat"|"health"){
    if(name === "idle"){
      if(this.#idleTimer) clearTimeout(this.#idleTimer);
      this.#idleTimer = null;
    }else if(name === "heartbeat"){
      if(this.#heartbeatTimer) clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }else{
      if(this.#healthTimer) clearInterval(this.#healthTimer);
      this.#healthTimer = null;
    }
  }
}
