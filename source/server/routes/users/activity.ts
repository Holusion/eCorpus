import { Request, Response } from "express";

import { NotificationManager, NotificationSink } from "../../notifications/manager.js";
import { NotificationItem } from "../../notifications/types.js";
import { BadRequestError, HTTPError } from "../../utils/errors.js";
import { localize } from "../../utils/i18n.js";
import { getLocals, getUser } from "../../utils/locals.js";
import { createLogger } from "../../utils/log/index.js";
import { qsToInt } from "../../utils/query.js";

const log = createLogger("http:activity");

/** Sent along with refusals. Clients are expected to add their own jitter. */
const RETRY_AFTER_SECONDS = 30;

/**
 * What a client should wait before reconnecting, for those relying on the browser's EventSource.
 * It's spread out so that a server restart doesn't get every client back at the same moment.
 */
function retryDelayMillis(){
  return Math.round(1000 + Math.random()*10000);
}


/**
 * Holds back changes until the current state has been written.
 *
 * The subscription has to come before the state is read for nothing to be missed. A change that
 * arrives in between may be older than the state: written after it, in commit order, the last one
 * about each item is still the newest.
 */
class ActivityStream implements NotificationSink{
  #backlog: string[]|null = [];
  /** Whether the manager ended this stream before it started */
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

  start(state: string){
    const backlog = this.#backlog ?? [];
    this.#backlog = null;
    this.res.set({
      "Content-Type": "text/event-stream",
      //A stream isn't to be stored or transformed along the way
      "Cache-Control": "no-cache, no-transform, private",
      //Tells nginx not to hold it back. Other proxies ignore it.
      "X-Accel-Buffering": "no",
    });
    this.res.flushHeaders();
    this.res.write(`retry: ${retryDelayMillis()}\n\n${state}${backlog.join("")}`);
  }
}


/**
 * A user's activity: `{notifications}`, the `?limit` first ones (20 by default, at most 100), read or not:
 * those whose task hasn't settled (what's going on), then the last to have changed, by their `mtime`.
 *
 * As JSON by default. With `Accept: text/event-stream`: the same as a `state` event, then a `notification` event
 * for each change of one, carrying its new state (or its id and `deleted: true`), and a `ping` event with no data
 * every so often, for clients to tell it's still alive. Notifications have the same shape everywhere.
 */
export async function getUserActivity(req: Request, res: Response): Promise<void>{
  const user_id = parseInt(req.params.uid, 10);
  //Checked before anything else: a stream would have subscribed by the time it's used
  const limit = NotificationManager.notificationsLimit(qsToInt(req.query.limit));
  res.vary("Accept");
  const type = req.accepts(["application/json", "text/event-stream"]);
  if(type === "text/event-stream"){
     return void await streamActivity(req, res, user_id, limit);
  }else if(!type){
     throw new HTTPError(406, localize("errors.notAcceptable"));
  }
  res.status(200).send(await getActivity(req, user_id, limit));
}

export interface Activity{
  notifications: NotificationItem[];
}

async function getActivity(req: Request, user_id: number, limit: number): Promise<Activity>{
  return {notifications: await getLocals(req).notifications.getNotifications(user_id, {limit})};
}


function isId(id: unknown): id is number{
  return Number.isSafeInteger(id) && 0 < (id as number);
}

/**
 * Marks some of a user's notifications as read: `{ids}`, explicitly. There's no "everything up to",
 * which could swallow a notification the client hasn't displayed yet.
 * Ids that aren't the user's are ignored. Clients following the activity get the changes from there.
 */
export async function markActivityRead(req: Request, res: Response): Promise<void>{
  const user_id = parseInt(req.params.uid, 10);
  const {ids} = req.body ?? {};
  if(!Array.isArray(ids) || 1000 < ids.length || !ids.every(isId)) throw new BadRequestError(`Expected {ids}, a list of notification ids`);
  await getLocals(req).notifications.markRead(user_id, ids);
  res.status(204).end();
}


/**
 * Streams are short-lived on purpose. Permissions are checked once, when connecting, so
 * reconnecting is what makes a change of permissions or a revoked session apply to them.
 */
async function streamActivity(req: Request, res: Response, user_id: number, limit: number): Promise<void>{
  if(req.method === "HEAD"){
    //Express routes those here too. There is no body to send, so it would just hang.
    res.status(200).type("text/event-stream").end();
    return;
  }
  const {notifications, config} = getLocals(req);
  const stream = new ActivityStream(res);

  let closed = false;
  let unsubscribe: (()=>void)|undefined;
  let expiry: NodeJS.Timeout|undefined;
  res.once("close", ()=>{
    closed = true;
    clearTimeout(expiry);
    unsubscribe?.();
  });

  try{
    unsubscribe = await notifications.subscribe(user_id, stream, {owner: getUser(req)!.uid});
  }catch(e){
    res.set("Retry-After", RETRY_AFTER_SECONDS.toString());
    if(e instanceof HTTPError) throw e;
    log.warn({err: e}, "Can't subscribe to notifications");
    throw new HTTPError(503, localize("errors.serviceUnavailable"));
  }
  if(closed) return unsubscribe();

  const state = await getActivity(req, user_id, limit);
  if(closed) return;
  if(stream.ended){
    //The connection was lost while we were reading the state: anything could be missing after it
    res.set("Retry-After", RETRY_AFTER_SECONDS.toString());
    throw new HTTPError(503, localize("errors.serviceUnavailable"));
  }

  stream.start(`event: state\ndata: ${JSON.stringify(state)}\n\n`);

  //Zero wouldn't mean "disabled" here: it would leave streams with no permissions check
  const lifetime = (config.get("activity_stream_seconds") || 900) * 1000;
  expiry = setTimeout(()=>{
    //In that order: nothing must be written to a response that has ended
    unsubscribe?.();
    res.end();
  }, lifetime * (0.8 + Math.random()*0.4)).unref();
}
