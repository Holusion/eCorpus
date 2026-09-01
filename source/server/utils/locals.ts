
import e, { NextFunction, Request, RequestHandler, Response } from "express";
import { basename, dirname } from "path";
import User, { isUserAtLeast, SafeUser, UserRole } from "../auth/User.js";
import { expand, levelScopes, maxFamilyScope, PUBLIC_SCOPES } from "../auth/Token.js";
import UserManager, { AccessLevel, isAccessType, toAccessLevel } from "../auth/UserManager.js";
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
  /**
   * What the *user* (account) may exercise, from the live level
   * ({@link levelScopes}). Unset means anonymous → {@link PUBLIC_SCOPES}.
   */
  accountScopes?: ReadonlySet<string>;
  /**
   * What the *credential* delegated, i.e. `expand(token.scope)`. `null` (or
   * unset) means no credential restriction — a session or an anonymous
   * request. The request's *effective* authority is
   * `accountScopes ∩ credentialScopes` (see {@link getEffectiveScopes}).
   */
  credentialScopes?: ReadonlySet<string> | null;
}

/**
 * Record the identity resolved for this request (authenticate middleware,
 * login handlers). Always request-scoped: header-based authentication never
 * writes to the session cookie, so revoking the credential takes effect
 * immediately.
 *
 * `accountScopes` is always derived from the *live* level, so a demotion takes
 * effect on the next request even for a long-lived token. `credentialScopes`
 * is the (frozen) token scope, or `null` for a session — a session carries the
 * user's full authority, narrowed by nothing.
 */
export function setUser(res: Response, user: SafeUser, method: AuthMethod, credentialScopes: ReadonlySet<string> | null = null) {
  (res.locals as AuthLocals).user = user;
  (res.locals as AuthLocals).authMethod = method;
  //levelScopes is the raw, un-expanded grant; expand it here (as authenticate.ts
  //does for the credential) so the read⊆write⊆admin ladder is applied once.
  (res.locals as AuthLocals).accountScopes = expand(levelScopes(user.level));
  (res.locals as AuthLocals).credentialScopes = credentialScopes;
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

/**
 * Route guard requiring an authenticated user whose credential grants *every*
 * named scope ({@link hasScope}) — a credential-only delegation gate,
 * independent of the user's level. Used where the *token* needs scopes but the
 * *level* requirement isn't a point on the ACL ladder, e.g. the bulk scene
 * import (`corpus:write scenes:write` on the token, any authenticated user,
 * per-scene checks inside the task). Where both layers are needed, prefer
 * {@link policy}.
 */
export function requireScope(...names: string[]): RequestHandler {
  return function requireScopeMdw(req: Request, res: Response, next: NextFunction) {
    res.append("Cache-Control", "private");
    if (!getUser(req)?.uid) return next(new UnauthorizedError());
    if (!names.every(n => hasScope(res, n))) {
      //Authenticated, but the credential wasn't delegated this scope.
      res.set("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${names.join(" ")}"`);
      return next(new ForbiddenError(`insufficient_scope: ${names.join(" ")}`));
    }
    next();
  };
}



/**
 * Level gate for the server-rendered `/ui` pages — deliberately the only
 * level-based guard left. Requires a user at least `min`, bearing their full
 * authority (a session, or an `all`-scoped token). Views aggregate content
 * across scope families (the admin panel mixes config, users and groups; the
 * design showcase belongs to no family), so they are gated by *who the user
 * is*, not by a delegated scope. JSON API routes must use {@link policy}
 * instead, which tells a level failure (401) apart from a too-narrow
 * credential (403 `insufficient_scope`) per scope.
 */
export function requireLevel(min: UserRole): RequestHandler {
  return function requireLevelMdw(req: Request, res: Response, next: NextFunction) {
    res.append("Cache-Control", "private");
    if (isUserAtLeast(getUser(req), min) && isFullAccess(res)) next();
    else next(new UnauthorizedError());
  };
}

/**
 * Wraps middlewares to find if at least one passes.
 * Usefull for conditional rate-limiting: a branch's authorization failure
 * (401 — or 403, a too-narrow credential) must not veto an alternative grant,
 * so both fall through to the next handler. Any other error propagates.
 * @example either(policy({scope: "users:admin"}), rateLimit({...}))
 */
export function either(...handlers: Readonly<RequestHandler[]>): RequestHandler {
  return (req, res, next) => {
    let mdw = handlers[0];
    if (!mdw) return next(new UnauthorizedError());
    return mdw(req, res, (err) => {
      if (!err) return next();
      else if (err instanceof UnauthorizedError || err instanceof ForbiddenError) return either(...handlers.slice(1))(req, res, next);
      else return next(err);
    });
  }
}

/** The resource a {@link policy} `access` check applies to. */
export type PolicyTarget = "scene" | "task" | "user" | "group";

/**
 * Resolve the requester's access level on the resource named by a
 * {@link PolicyTarget}. One resolver per target, shared signature, each
 * reading a fixed route parameter (`:scene`, `:id`, `:uid`, `:group`) — a
 * route using `access` must declare that exact param name. A missing
 * resource throws {@link NotFoundError} (→ 404), like `taskScheduler.getTask`.
 * This is the single per-target hook; everything else `_access` does is generic.
 */
type AccessResolver = (req: Request, requester: SafeUser | null) => Promise<AccessLevel>;

const RESOLVERS: Record<PolicyTarget, AccessResolver> = {
  scene: (req, requester) => getUserManager(req).getAccessRights(req.params.scene, requester?.uid ?? null),
  //A task: owned by the requester (admin), else derived from its scene's ACL.
  //Anonymous is rejected *before* the task is fetched: getTask's 404 must not
  //become an unauthenticated task-id existence oracle (tasks answer 401).
  task: async (req, requester) => {
    if (!requester) return AccessLevel.None;
    const { taskScheduler, userManager } = getLocals(req);
    const task = await taskScheduler.getTask(parseInt(req.params.id, 10));
    if (task.user_id != null && task.user_id === requester.uid) return AccessLevel.Admin;
    return task.scene_id ? userManager.getAccessRights(task.scene_id, requester.uid) : AccessLevel.None;
  },
  //A user account: yourself (write, i.e. edit your profile) or an admin (any).
  user: async (req, requester) =>
    requester?.level === "admin" ? AccessLevel.Admin
      : (requester && requester.uid === parseInt(req.params.uid, 10)) ? AccessLevel.Write
        : AccessLevel.None,
  //A group: its members may read it; whole-group administration is a level
  //(manage), not a membership role. A future per-group role (owner, moderator…)
  //would slot in here as "write" — extending this resolver, not the scopes.
  group: async (req, requester) => {
    if (!requester) return AccessLevel.None;
    if (isUserAtLeast(requester, "manage")) return AccessLevel.Admin;
    return (await getUserManager(req).isMemberOfGroup(requester.uid, req.params.group)) ? AccessLevel.Read : AccessLevel.None;
  },
};

/**
 * Scenes and groups hide a resource the requester can't see (404 on a GET, or
 * any method once access is `none`) so existence stays private; tasks and
 * users answer a plain 401 for insufficient access (their current,
 * test-pinned behavior).
 */
function hidesExistence(on: PolicyTarget): boolean { return on === "scene" || on === "group"; }

/**
 * The scope family whose `read < write < admin` ladder gates a target's
 * `access` checks 1:1, or null when the credential is gated by an explicit
 * `scope` option instead (user routes: their access check is identity-shaped —
 * yourself or an admin — not a point on any scope ladder).
 */
const FAMILY: Record<PolicyTarget, string | null> = {
  scene: "scenes",
  task: "tasks",
  group: "groups",
  user: null,
};

/**
 * The scope a too-narrow credential lacks for an `access:min` check on `on` —
 * the pre-ACL 403 — or null when the target has no scope family.
 */
function requiredScope(on: PolicyTarget, min: "read" | "write" | "admin"): string | null {
  const family = FAMILY[on];
  return family && `${family}:${min}`;
}

/**
 * The cap the credential puts on the resolved access level: the highest rung
 * of the target's scope family it holds. By construction ≥ any `min` that
 * passed the {@link requiredScope} 403, so it never flips a policy decision —
 * its job is keeping the published `res.locals.access` *effective* (what the
 * credential may actually exercise, eg. for display). Sessions, anonymous
 * requests and family-less targets are uncapped.
 */
function accessCap(on: PolicyTarget, res: Response): AccessLevel {
  const credential = getCredentialScopes(res);
  const family = FAMILY[on];
  if (!credential || !family) return AccessLevel.Admin;
  return toAccessLevel(maxFamilyScope(credential, family));
}

/**
 * Generic internal access check over a {@link PolicyTarget}.
 * Caches the result in `res.locals.access` (a numeric {@link AccessLevel} —
 * compare with plain operators) so a generic check can precede a more specific
 * per-handler one. Admins bypass the ACL; a token's scope may cap the access
 * *level* obtained, never the resource's visibility.
 */
function _access(on: PolicyTarget, min: Exclude<PolicyAccess, null>, req: Request, res: Response, next: NextFunction) {
  if (!isAccessType(min) || min === null) throw new InternalError(`Bad access level : ${min}`);
  const check = toAccessLevel(min);
  const requester = getUser(req);
  const level = requester?.level ?? "create";

  res.set("Vary", "Cookie, Authorization");
  const cap = accessCap(on, res);

  if (level == "admin") {
    const access = Math.min(AccessLevel.Admin, cap);
    res.locals.access = access;
    if (check <= access) return next();
    return next(new UnauthorizedError(`token scope does not allow ${min} access`));
  }

  //AccessLevel.None is 0, hence falsy: the cache check must be a null check.
  (res.locals.access != null ?
    Promise.resolve(res.locals.access as AccessLevel) :
    RESOLVERS[on](req, requester)
  ).then(resolved => {
    const access = Math.min(resolved, cap);
    res.locals.access = access;
    if (check <= access) {
      next();
    } else if (hidesExistence(on) && (req.method === "GET" || access <= AccessLevel.None)) {
      //Rewrite Unauthorized to "not found" so we don't leak private data
      next(new NotFoundError(`Can't find the requested resource. It may be private or not exist entirely.`));
    } else {
      next(new UnauthorizedError(`insufficient rights: ${min} required`));
    }
  }, next);
}

/** Resource-ACL level a {@link policy} enforces, or `null` for none. */
export type PolicyAccess = "read" | "write" | "admin" | null;

export interface PolicyOptions {
  /**
   * Scope the request's authority must include (401 if the account lacks
   * it, 403 `insufficient_scope` if only the credential does). Omit for none.
   * "Any identified requester, whatever its level" is `scope: "corpus:read"` —
   * the baseline every user level holds and every credential carries
   * implicitly, but anonymous ({@link PUBLIC_SCOPES}) does not.
   */
  scope?: string | null;
  /** Resource-ACL level to enforce, or omit for no ACL check. */
  access?: PolicyAccess;
  /** Which resource `access` applies to (default `"scene"`). */
  on?: PolicyTarget;
}

/**
 * The single route guard: effective authority is the intersection of what the
 * **user** may do (level, live from the DB), what the **credential** delegated
 * (token scope, frozen), and what the **resource ACL** allows.
 *
 * Checked in order — scope *before* ACL, so a too-narrow credential gets a
 * uniform 403 instead of an existence oracle:
 *  1. `scope ∉ levelScopes(level)` → **401** (the account can't; matches the old
 *     level guards and the {@link either} fall-through);
 *  2. `scope ∈ level` but `∉ token.scope` → **403 `insufficient_scope`**
 *     (RFC6750 §3.1 — re-mint a broader token);
 *  3. resource ACL too low → 404 (existence-hiding, scenes) or 401, via
 *     {@link _access} (which caches `res.locals.access`, sets `Vary`, bypasses
 *     for admins).
 *
 * `access` names the level; `on` names the resource. The scope an `access`
 * check derives ({@link requiredScope}) is a *credential* cap only — the
 * account is not gated on it, so an anonymous/unprivileged requester still
 * gets _access's 404 rather than a 401 that would reveal the resource exists.
 */
export function policy({ scope = null, access = null, on = "scene" }: PolicyOptions = {}): RequestHandler {
  return function policyMdw(req: Request, res: Response, next: NextFunction) {
    res.append("Cache-Control", "private");
    if (scope !== null) {
      if (!getAccountScopes(res).has(scope)) return next(new UnauthorizedError());
      const err = insufficientScope(res, scope);
      if (err) return next(err);
    }
    if (access !== null) {
      const name = requiredScope(on, access);
      if (name) {
        const err = insufficientScope(res, name);
        if (err) return next(err);
      }
      return _access(on, access, req, res, next);
    }
    return next();
  };
}

/**
 * A 403 `insufficient_scope` if the request's credential wasn't delegated
 * `scope`, else null. A session (no credential) never fails this.
 */
function insufficientScope(res: Response, scope: string): HTTPError | null {
  const credential = getCredentialScopes(res);
  if (credential && !credential.has(scope)) {
    res.set("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${scope}"`);
    return new ForbiddenError(`insufficient_scope: ${scope}`);
  }
  return null;
}

/** A route deliberately open to everyone — an explicit, greppable declaration. */
policy.public = function policyPublic(): RequestHandler {
  return function publicMdw(_req: Request, _res: Response, next: NextFunction) { next(); };
};

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

/** Every mintable concrete scope, i.e. what an `all`-scoped credential expands to. */
const FULL_CREDENTIAL: ReadonlySet<string> = expand(["all"]);

/**
 * What the *account* (user level) may exercise this request. Anonymous holds
 * {@link PUBLIC_SCOPES} — never the empty set, so a public read still resolves.
 */
export function getAccountScopes(res: Response): ReadonlySet<string> {
  return (res.locals as AuthLocals).accountScopes ?? PUBLIC_SCOPES;
}

/**
 * What the *credential* delegated, or `null` when the credential imposes no
 * restriction (a session, or an anonymous request).
 */
export function getCredentialScopes(res: Response): ReadonlySet<string> | null {
  return (res.locals as AuthLocals).credentialScopes ?? null;
}

/**
 * The effective per-scene access to advertise for display (eg. the scene edit
 * button in `views/index.ts`): the ACL access the user has, capped by their
 * credential's scene scope ({@link accessCap}). This stays *effective* even
 * though the authorization *decision* is now a conjunction of scope + ACL.
 */
export function effectiveAccess(res: Response, aclAccess: AccessLevel): AccessLevel {
  return Math.min(aclAccess, accessCap("scene", res));
}

/**
 * Whether the request's credential carries its owner's full authority: a
 * session (no credential restriction), or a token bearing the `all` scope.
 * A restriction-scoped token (`scenes:*`) fails every level-based guard and
 * account management, however privileged its owner.
 * Anonymous requests hold no restricting credential: this returns true and
 * identity checks reject them.
 * Internal to this module (the {@link requireLevel} view guard); route code
 * expresses "session-only" via a non-mintable scope (`account:admin`,
 * `users:admin`, `instance:write`).
 */
function isFullAccess(res: Response): boolean {
  const credential = getCredentialScopes(res);
  if (!credential) return true;
  for (const s of FULL_CREDENTIAL) if (!credential.has(s)) return false;
  return true;
}

/**
 * Whether the request's *credential* grants one of the named scopes — a
 * delegation gate, independent of the user's level. A session (or anonymous)
 * carries no credential restriction and passes; a token passes only for the
 * scopes it named (`account:admin` is non-mintable, so no token ever has it).
 *
 * This is deliberately credential-only, not effective (account ∩ credential):
 * routes like bulk scene import gate the *token* on `corpus:write` while the
 * per-scene ACL — not the user's global level — decides what may be written.
 * The level check lives in {@link policy} (which also needs the two facts
 * apart, to return 401 for a level failure vs. 403 for a scope failure).
 */
export function hasScope(res: Response, ...names: string[]): boolean {
  const credential = getCredentialScopes(res);
  return !credential || names.some(n => credential.has(n));
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

