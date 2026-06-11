
import e, { NextFunction, Request, RequestHandler, Response } from "express";
import { basename, dirname } from "path";
import User, { isUserAtLeast, SafeUser } from "../auth/User.js";
import { sceneCap } from "../auth/Token.js";
import UserManager, { AccessType, AccessTypes, fromAccessLevel, toAccessLevel } from "../auth/UserManager.js";
import Vfs, { GetFileParams, Scene } from "../vfs/index.js";
import { BadRequestError, ForbiddenError, HTTPError, InternalError, NotFoundError, UnauthorizedError } from "./errors.js";
import Templates, { AcceptedLocales, locales } from "./templates/index.js";
import { Config } from "./config.js";
import { isEmbeddable } from "../routes/services/oembed.js";
import { TaskScheduler } from "../tasks/scheduler.js";
import { sceneLanguages, uiLanguages } from "./languages.js";


export interface AppLocals{
  fileDir: string;
  userManager: UserManager;
  vfs: Vfs;
  taskScheduler: TaskScheduler;
  templates: Templates;
  config: Config;
  /** Length of a session, in milliseconds since epoch */
  sessionMaxAge: number;
}


export type AppParameters = Omit<AppLocals, "sessionMaxAge" | "templates">;

export function getLocals(req: Request) {
  return req.app.locals as AppLocals;
}

export interface SessionData {
  /**
   * Opaque server-side session credential.
   * Identity is resolved from the user_sessions table by the authenticate
   * middleware: the cookie itself carries no identity claims.
   */
  sid?: string;
  /** Advisory expiry mirror, in ms since epoch. Authority is the user_sessions table */
  expires?: number;
  lang?: AcceptedLocales;
}

export function getSession(req: Request) {
  return req.session as SessionData | null | undefined;
}

/** How the current request was authenticated */
export type AuthMethod = "session" | "token";

/**
 * Request-scoped authentication state, carried in `res.locals`
 * (like `res.locals.access`). Use {@link getUser}/{@link getAuthMethod} to
 * read it and {@link setUser} to write it: the storage itself is untyped.
 */
interface AuthLocals {
  user?: SafeUser;
  authMethod?: AuthMethod;
  /** The authenticating token's scope. Unset for sessions */
  scope?: string[];
}

/**
 * Record the identity resolved for this request (authenticate middleware,
 * login handlers). Always request-scoped: header-based authentication never
 * writes to the session cookie, so revoking the credential takes effect
 * immediately.
 */
export function setUser(res: Response, user: SafeUser, method: AuthMethod, scope?: string[]) {
  (res.locals as AuthLocals).user = user;
  (res.locals as AuthLocals).authMethod = method;
  (res.locals as AuthLocals).scope = scope;
}

export function canonical(req: Request): URL
export function canonical(req: Request, ref: string): URL
export function canonical(req: Request, ref?: string): URL {
  let host = getHost(req);
  return new URL(ref ?? req.path, host);
}

/**
 * @throws {InternalError} if app.locals.userManager is not defined for this request
 */
export function getUserManager(req: Request): UserManager {
  let userManager: UserManager = getLocals(req).userManager;
  //istanbul ignore if
  if (!userManager) throw new InternalError("Badly configured app : userManager is not defined in app.locals");
  return userManager
}

export function getFileDir(req: Request): string {
  let fileDir = getLocals(req).fileDir;
  if (!fileDir) throw new InternalError("Badly configured app : fileDir is not a valid string");
  return fileDir;
}

export function isUser(req: Request, res: Response, next: NextFunction) {
  res.append("Cache-Control", "private");
  if (getUser(req)?.uid) next();
  else next(new UnauthorizedError());
}

/**
 * Like {@link isUser}, but additionally requires the credential's full
 * authority ({@link isFullAccess}). Reserved for what no restriction scope
 * may ever grant: account management (sessions, tokens, password) — anything
 * a token could use to escalate back to its owner's full authority.
 */
export function isFullUser(req: Request, res: Response, next: NextFunction) {
  res.append("Cache-Control", "private");
  if (getUser(req)?.uid && isFullAccess(res)) next();
  else next(new UnauthorizedError());
}

/**
 * Route guard requiring an authenticated user whose credential grants one of
 * the named scopes ({@link hasScope}).
 * Scopes gate the *token*; combine with a level guard (`isCreator`…) to gate
 * the *user*: `router.post("/:scene", requireScope("scenes:create"), isCreator, …)`.
 */
export function requireScope(...names: string[]): RequestHandler {
  return function requireScopeMdw(req: Request, res: Response, next: NextFunction) {
    res.append("Cache-Control", "private");
    if (getUser(req)?.uid && hasScope(res, ...names)) next();
    else next(new UnauthorizedError());
  };
}



/**
 * Special case to allow user creation if no user exists in the database
 */
export function isAdministratorOrOpen(req: Request, res: Response, next: NextFunction) {
  isAdministrator(req, res, (err) => {
    if (!err) return next();
    Promise.resolve().then(async () => {
      let userManager = getUserManager(req);
      let users = (await userManager.getUsers());
      if (users.length == 0) return;
      else throw err;
    }).then(() => next(), next);
  });
}
/**
 * Checks if user.isAdministrator is true
 * Not the same thing as canAdmin() that checks if the user has admin rights over a scene
 */
export function isAdministrator(req: Request, res: Response, next: NextFunction) {
  res.append("Cache-Control", "private");

  if (getUser(req)?.level == "admin" && isFullAccess(res)) next();
  else next(new UnauthorizedError());
}

/**
 * Checks if user.isCreator is true
 * Not the same thing as canWrite() that checks if the user has write rights over a scene
 * Checks the *user's* level only: every route it guards also carries a
 * {@link requireScope} guard naming the scope a token needs (`scenes:create`,
 * `tasks:write`).
 */
export function isCreator(req: Request, res: Response, next: NextFunction) {
  res.append("Cache-Control", "private");
  if (isUserAtLeast(getUser(req), "create")) next();
  else next(new UnauthorizedError());
}

/**
 * Checks if user.isCreator is true
 * Not the same thing as canWrite() that checks if the user has write rights over a scene
 */
export function isManage(req: Request, res: Response, next: NextFunction) {
  res.append("Cache-Control", "private");
  if (isUserAtLeast(getUser(req), "manage") && isFullAccess(res)) next();
  else next(new UnauthorizedError());
}

/**
 * Checks if user is a member of a group or is at least Manage
 */
export async function isMemberOrManage(req: Request, res: Response, next: NextFunction) {
  res.append("Cache-Control", "private");
  let userManager = getUserManager(req);
  let user = getUser(req)
  let { group } = req.params;
  const canSeeGroup = user && isFullAccess(res)
    && (await userManager.isMemberOfGroup(user.uid, group) || isUserAtLeast(user, "manage"));
  if (canSeeGroup) next();
  else next(new UnauthorizedError());
}

/**
 * Wraps middlewares to find if at least one passes
 * Usefull for conditional rate-limiting
 * @example either(isAdministrator, isUser, rateLimit({...}))
 */
export function either(...handlers: Readonly<RequestHandler[]>): RequestHandler {
  return (req, res, next) => {
    let mdw = handlers[0];
    if (!mdw) return next(new UnauthorizedError());
    return mdw(req, res, (err) => {
      if (!err) return next();
      else if (err instanceof UnauthorizedError) return either(...handlers.slice(1))(req, res, next);
      else return next(err);
    });
  }
}

/**
 * Generic internal permissions check
 * Caches result in `req.locals.access` so it's not a problem to apply a generic perms check
 * to a group of routes then more specific ACL checks for individual handlers
 */
function _perms(check: number, req: Request, res: Response, next: NextFunction) {
  let { scene } = req.params;
  let { level = "create", uid = null } = (getUser(req) ?? {}) as Partial<SafeUser>;
  if (!scene) throw new BadRequestError("no scene parameter in this request");
  if (check < 0 || AccessTypes.length <= check) throw new InternalError(`Bad permission level : ${check}`);

  res.set("Vary", "Cookie, Authorization");
  //A token's scope may cap the access *level* obtained on a scene; it never
  //restricts visibility: capped requesters see the scenes they always see.
  const cap = toAccessLevel(getSceneCap(res));

  if (level == "admin") {
    const access = fromAccessLevel(Math.min(toAccessLevel("admin"), cap));
    res.locals.access = access;
    if (check <= toAccessLevel(access)) return next();
    return next(new UnauthorizedError(`token scope does not allow ${fromAccessLevel(check)} access to ${scene}`));
  }

  let userManager = getUserManager(req);
  (res.locals.access ?
    Promise.resolve(res.locals.access) :
    userManager.getAccessRights(scene, uid)
  ).then(access => {
    access = fromAccessLevel(Math.min(toAccessLevel(access), cap));
    res.locals.access = access;
    const lvl = toAccessLevel(access);
    if (check <= lvl) {
      next();
    } else if (req.method === "GET" || lvl <= toAccessLevel("none")) {
      next(new NotFoundError(`Can't find scene ${scene}. It may be private or not exist entirely.`))
    } else {
      //User has insuficient level but can read the scene
      next(new UnauthorizedError(`user does not have ${fromAccessLevel(check)} rights on ${scene}`));
    }
  }, next);
}

/**
 * Check user read access over a scene
 */
export const canRead = _perms.bind(null, toAccessLevel("read"));
/**
 * Check user write access over a scene
 */
export const canWrite = _perms.bind(null, toAccessLevel("write"));
/**
 * Check user administrative access over a scene
 */
export const canAdmin = _perms.bind(null, toAccessLevel("admin"));

/**
 * Identity resolved for this request by the authenticate middleware.
 * This is the single accessor downstream code should use: it does not care
 * whether the request authenticated with a session cookie or a header.
 * Takes the request (most call sites have nothing else) and reaches the
 * response locals through Express' `req.res` back-reference.
 */
export function getUser(req: Request): SafeUser | null {
  return (req.res?.locals as AuthLocals | undefined)?.user ?? null;
}

/**
 * How the current request was authenticated, or `null` when anonymous.
 * Lets handlers restrict an operation to one credential type (eg. only a
 * session may mint tokens or grant OAuth consent).
 */
export function getAuthMethod(res: Response): AuthMethod | null {
  return (res.locals as AuthLocals).authMethod ?? null;
}

/**
 * The cap the authenticating credential puts on per-scene access (see
 * {@link sceneCap}). Sessions and `all`-scoped tokens are not capped.
 */
export function getSceneCap(res: Response): AccessType {
  const scope = (res.locals as AuthLocals).scope;
  return scope ? sceneCap(scope) : "admin";
}

/**
 * Whether the request's credential carries its owner's full authority: a
 * session, or a token bearing the `all` scope.
 * Tokens grant only what their scopes name (deny-by-default): a
 * restriction-scoped token (`scenes:*`) fails every level-based guard and
 * account management, however privileged its owner.
 * Anonymous requests hold no restricting credential: this returns true and
 * identity checks reject them.
 */
export function isFullAccess(res: Response): boolean {
  const scope = (res.locals as AuthLocals).scope;
  return !scope || scope.includes("all");
}

/**
 * Whether the request's credential grants one of the named scopes.
 * Sessions and `all`-scoped tokens grant everything.
 */
export function hasScope(res: Response, ...names: string[]): boolean {
  const scope = (res.locals as AuthLocals).scope;
  return !scope || scope.includes("all") || names.some(n => scope.includes(n));
}

export function getUserId(req: Request) {
  const user = getUser(req);
  return user ? user.uid : null;
}

export function getFileParams(req: Request): GetFileParams {
  let { scene, name } = req.params;
  if (!scene) throw new BadRequestError(`Scene parameter not provided`);
  if (!name) throw new BadRequestError(`File parameter not provided`);

  return { scene, name };
}

export function getVfs(req: Request) {
  let vfs: Vfs = getLocals(req).vfs;
  //istanbul ignore if
  if (!vfs) throw new InternalError("Badly configured app : vfs is not defined in app.locals");
  return vfs;
}


export function getTaskScheduler(req: Request) {
  const scheduler = getLocals(req).taskScheduler;
  if (!scheduler) throw new InternalError("Badly configured app: task scheduler is not defined in app.locals");
  return scheduler;
}

export function getHost(req: Request): URL {
  const trust = req.app.get("trust proxy fn");
  let host = req.get("X-Forwarded-Host");
  if (!host || !trust(req.socket.remoteAddress, 0)) {
    host = req.get("Host");
  } else if (host.indexOf(",") !== -1) {
    host = host.substring(0, host.indexOf(",")).trimEnd();
  }
  return new URL(`${req.protocol}://${host}`);
}

/**
 * Validates if a requested redirect URL would be within the current origin
 * Also make the URL canonical (http://example.com/foo)
 */
export function validateRedirect(req: Request, redirect: string | any): URL {
  let host = getHost(req);
  try {
    let target = new URL(redirect, host);
    if (target.origin !== host.origin) throw new BadRequestError(`Redirect origin mismatch`);
    return target;
  } catch (e) {
    throw new BadRequestError(`Bad Redirect parameter`);
  }

}

/**
 * Tries to determine if a request is for embedded content
 * @param req 
 */
export function isEmbed(req: Request): boolean {
  if (typeof req.query.embed === "string") return req.query.embed != "0" && req.query.embed != "false";
  if (typeof req.headers["sec-fetch-dest"] === "string") return req.headers["sec-fetch-dest"].indexOf("frame") !== -1 || req.headers["sec-fetch-dest"] === "embed";
  return false;
}

/**
 * Common properties for template rendering.
 * All props required for navbar/footer rendering should be set here
 */
export function useTemplateProperties(req: Request, res: Response, next?: NextFunction) {
  const session = getSession(req);
  const { config } = getLocals(req);
  const user = getUser(req);
  const { search } = req.query;
  const lang = session?.lang ?? (req.acceptsLanguages(locales) || "en");
  Object.assign(res.locals, {
    lang,
    languages: uiLanguages.map(l => {
      const code = l.toLowerCase();
      return { selected: lang === code, code, key: `lang.${code}` };
    }),
    scene_languages: sceneLanguages.map(l => {
      const code = l.toLowerCase();
      return { selected: lang === code, code, key: `lang.${code}` };
    }),
    user: user,
    location: req.originalUrl,
    search,
    brand: config.get("brand"),
    embeddable: isEmbeddable(req.originalUrl),
    canonical: canonical(req).toString(),
    root_url: canonical(req, "/").toString(),
    color_primary: config.get("color_primary"),
    color_secondary: config.get("color_secondary"),
  });
  if (next) next();
}

