import { NextFunction, Request, Response } from "express";

import { EventKey, EventSink } from "../../tasks/events.js";
import { HTTPError, NotFoundError } from "../../utils/errors.js";
import { localize } from "../../utils/i18n.js";
import { getAccountScopes, getCredentialScopes, getLocals, getUser } from "../../utils/locals.js";
import { createLogger } from "../../utils/log/index.js";

const log = createLogger("events");

/** Sent along with refusals. Clients are expected to add their own jitter. */
const RETRY_AFTER_SECONDS = 30;

/**
 * What a client should wait before reconnecting, for those relying on the browser's EventSource.
 * It's spread out so that a server restart doesn't get every client back at the same moment.
 */
function retryDelayMs(){
  return Math.round(1000 + Math.random()*10000);
}

/**
 * Holds back events until the snapshot of current tasks has been written.
 *
 * The subscription has to come before the snapshot is read for nothing to be missed, but an
 * event that arrives in between might be newer than what the snapshot says: it has to come after.
 */
class EventStream implements EventSink{
  #backlog: string[]|null = [];
  /** Whether the hub ended this stream before it started */
  ended = false;

  constructor(private res: Response){}

  get writableLength(){
    return this.res.writableLength;
  }

  write(frame: string){
    if(this.#backlog) this.#backlog.push(frame);
    else this.res.write(frame);
  }

  end(){
    this.ended = true;
    if(!this.#backlog) this.res.end();
  }

  destroy(){
    this.res.destroy();
  }

  start(snapshot: string){
    const backlog = this.#backlog ?? [];
    this.#backlog = null;
    this.res.set({
      "Content-Type": "text/event-stream",
      //Replaces what policy() has set: a stream isn't to be stored or transformed along the way
      "Cache-Control": "no-cache, no-transform, private",
      //Tells nginx not to hold it back. Other proxies ignore it.
      "X-Accel-Buffering": "no",
    });
    this.res.flushHeaders();
    this.res.write(`retry: ${retryDelayMs()}\n\n${snapshot}${backlog.join("")}`);
  }
}

/**
 * Answers a request with a stream of the tasks in `scope`, beginning with a snapshot of those in flight.
 *
 * Streams are short-lived on purpose. Permissions are checked once, when connecting, so
 * reconnecting is what makes a change of permissions or a revoked session apply to them.
 */
async function openStream(req: Request, res: Response, keys: EventKey|EventKey[], scope: {user_id?: number, scene_id?: number}, inbox?: number){
  if(req.method === "HEAD"){
    //Express routes those here too. There is no body to send, so it would just hang.
    return res.status(200).type("text/event-stream").end();
  }
  const {events, taskScheduler, userManager, config} = getLocals(req);
  const stream = new EventStream(res);

  let closed = false;
  let unsubscribe: (()=>void)|undefined;
  let expiry: NodeJS.Timeout|undefined;
  res.once("close", ()=>{
    closed = true;
    clearTimeout(expiry);
    unsubscribe?.();
  });

  try{
    unsubscribe = await events.subscribe(keys, stream, {owner: getUser(req)!.uid});
  }catch(e){
    res.set("Retry-After", RETRY_AFTER_SECONDS.toString());
    if(e instanceof HTTPError) throw e;
    log.warn({err: e}, "Can't subscribe to events");
    throw new HTTPError(503, localize("errors.serviceUnavailable"));
  }
  if(closed) return unsubscribe();

  const [tasks, summary] = await Promise.all([
    taskScheduler.getActiveTasks(scope),
    inbox !== undefined ? userManager.getUnreadSummary(inbox) : undefined,
  ]);
  if(closed) return;
  if(stream.ended){
    //The connection was lost while we were reading the snapshot: anything could be missing after it
    res.set("Retry-After", RETRY_AFTER_SECONDS.toString());
    throw new HTTPError(503, localize("errors.serviceUnavailable"));
  }

  stream.start(`event: snapshot\ndata: ${JSON.stringify({tasks, unread: summary?.unread, unread_errors: summary?.errors})}\n\n`);

  //Zero wouldn't mean "disabled" here: it would leave streams with no permissions check
  const lifetime = (config.get("event_stream_seconds") || 900) * 1000;
  expiry = setTimeout(()=>{
    //In that order: nothing must be written to a response that has ended
    unsubscribe?.();
    res.end();
  }, lifetime * (0.8 + Math.random()*0.4)).unref();
}

/** Makes it look like those routes don't exist if the feature is disabled, for clients to not retry */
export function requireEvents(req: Request, res: Response, next: NextFunction){
  next(getLocals(req).config.get("enable_events") ? undefined : new NotFoundError());
}

export async function streamAllTasks(req: Request, res: Response){
  await openStream(req, res, "all", {});
}

export async function streamUserTasks(req: Request, res: Response){
  const user_id = parseInt(req.params.uid, 10);
  //An inbox is for its owner, unlike their tasks: an admin watching someone doesn't get to read it.
  //A token also has to be allowed to, since notifications aren't only about tasks.
  const credential = getCredentialScopes(res);
  const hasInbox = user_id === getUser(req)!.uid
    && getAccountScopes(res).has("account:read")
    && (!credential || credential.has("account:read"));
  if(hasInbox) await openStream(req, res, [{user: user_id}, {inbox: user_id}], {user_id}, user_id);
  else await openStream(req, res, {user: user_id}, {user_id});
}

export async function streamSceneTasks(req: Request, res: Response){
  const scene_id = await getLocals(req).vfs.getSceneId(req.params.scene);
  await openStream(req, res, {scene: scene_id}, {scene_id});
}
