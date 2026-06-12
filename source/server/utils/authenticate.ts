
import { NextFunction, Request, RequestHandler, Response } from "express";

import { HTTPError, UnauthorizedError } from "./errors.js";
import { getLocals, getSession, getUserManager, setUser } from "./locals.js";

/**
 * Resolves the request's identity (read it back with `getUser()`) from, in order:
 *  1. an `Authorization: Bearer ecorpus_…` API token, looked up in the `api_tokens` table;
 *  2. the session cookie's `sid`, looked up in the `user_sessions` table.
 *
 * Identity (including level) always comes from the database, so revocations,
 * password changes and level changes take effect on the next request.
 * A presented-but-invalid credential fails with 401; an absent credential
 * leaves the request anonymous.
 *
 * `Authorization: Basic` (user passwords) is not supported anymore: services
 * authenticate with revocable, scoped tokens (see docs/auth-redesign.md).
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
