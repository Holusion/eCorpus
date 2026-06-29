
import { NextFunction, Request, RequestHandler, Response } from "express";

import User from "../auth/User.js";
import { HTTPError, UnauthorizedError } from "./errors.js";
import { getLocals, getSession, getUserManager, setUser } from "./locals.js";

/**
 * Resolves the request's identity (read it back with `getUser()`) from, in order:
 *  1. an `Authorization: Bearer ecorpus_…` API token, looked up in the `api_tokens` table;
 *  2. an `Authorization: Basic` user password, verified against the `users` table;
 *  3. the session cookie's `sid`, looked up in the `user_sessions` table.
 *
 * Identity (including level) always comes from the database, so revocations,
 * password changes and level changes take effect on the next request.
 * A presented-but-invalid credential fails with 401; an absent credential
 * leaves the request anonymous.
 *
 * `Authorization: Basic` is a stateless re-login: it grants the user's full
 * authority (like a session cookie), mints no cookie, and is request-scoped.
 * It is meant for ad-hoc scripts/curl; services should prefer revocable, scoped
 * tokens (see docs/auth-redesign.md). Verifying the password costs a full scrypt
 * (the same cost `POST /auth/login` pays), so the Basic path is per-IP
 * rate-limited by `basicAuthLimiter` (see routes/index.ts) to keep it from
 * becoming a server-wide CPU-amplification lever.
 */
export default function authenticate(req: Request, res: Response, next: NextFunction) {
  const { sessionMaxAge } = getLocals(req);
  const now = Date.now();
  const session = getSession(req);

  let auth = req.get("Authorization");
  if (auth && auth.startsWith("Bearer ") && "Bearer ".length < auth.length) {
    //A presented token that doesn't verify is an error: don't fall through to anonymous.
    //The error message never echoes the token itself.
    getUserManager(req).authenticateToken(auth.slice("Bearer ".length).trim()).then(({ user, token }) => {
      setUser(res, user, "token", token.scope);
      next();
    }, next);
    return;
  }

  if (auth && auth.startsWith("Basic ") && "Basic ".length < auth.length) {
    const decoded = Buffer.from(auth.slice("Basic ".length), "base64").toString("utf-8");
    //Split on the first colon only: passwords may legitimately contain colons.
    const sep = decoded.indexOf(":");
    const username = sep === -1 ? decoded : decoded.slice(0, sep);
    const password = sep === -1 ? "" : decoded.slice(sep + 1);
    //An incomplete pair carries no usable credential: stay anonymous.
    if (!username || !password) return next();
    getUserManager(req).getUserByNamePassword(username, password).then((user) => {
      setUser(res, User.safe(user), "basic");
      next();
    }, (e) => {
      //A pair matching no user (404) or a malformed name (400) is not an error:
      //the same header is the OAuth token endpoint's `client_secret_basic`,
      //which that route reads itself. A real user with a wrong password (401)
      //is rejected. The error never echoes the credential.
      if ((e as HTTPError).code === 404 || (e as HTTPError).code === 400) next();
      else next(e);
    });
    return;
  }

  if (session?.sid) {
    const userManager = getUserManager(req);
    userManager.authenticateSession(session.sid).then(async ({ user, sessionId, expires }) => {
      if (expires.valueOf() < now) {
        req.session = null;
        await userManager.removeSession(sessionId).catch(() => {});
        throw new UnauthorizedError(`Session Token expired. Please reauthenticate`);
      }
      if (expires.valueOf() < now + sessionMaxAge * 0.66) {
        //Sliding renewal: less than 66% of the session's lifetime remains.
        const newExpires = new Date(now + sessionMaxAge);
        await userManager.renewSession(sessionId, newExpires);
        //The cookie's `expires` mirror is advisory (authority is the database):
        //changing it makes cookie-session re-emit the cookie with a fresh maxAge.
        session.expires = newExpires.valueOf();
      }
      setUser(res, user, "session");
      next();
    }).catch((e) => {
      if ((e as HTTPError).code === 401) {
        //Unknown or revoked sid: clear the stale cookie
        req.session = null;
      }
      next(e);
    });
    return;
  }

  if (req.session && !req.session.isNew && ((req.session as any).uid || (req.session as any).expires)) {
    //Cookie from before the server-side sessions migration (identity payload, no sid):
    //force a re-authentication.
    req.session = null;
    return next(new UnauthorizedError(`Session Token expired. Please reauthenticate`));
  }

  next();
}
