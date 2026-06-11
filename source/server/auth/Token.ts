import { createHash, randomBytes, timingSafeEqual } from "crypto";

import { Uid } from "../utils/uid.js";

/**
 * Constant prefix of every eCorpus API token.
 * Makes tokens recognizable to secret-scanning tools (CI hooks, GitHub push protection).
 */
export const TOKEN_PREFIX = "ecorpus";

/** Default lifetime of an OAuth2-granted access token: 30 days, in milliseconds */
export const DEFAULT_TOKEN_LIFETIME = 30 * 24 * 60 * 60 * 1000;

/** Maximum lifetime of an authorization code (RFC6749 recommends 10 minutes maximum) */
export const CODE_LIFETIME = 10 * 60 * 1000;

export interface ParsedToken {
  id: number;
  secret: Buffer;
}

/** Generate a token (or client, or code) secret. 32 bytes = 256 bits of entropy */
export function makeSecret(): Buffer {
  return randomBytes(32);
}

/**
 * Tokens secrets are stored as a single unsalted sha256: contrary to passwords
 * they are high-entropy random strings, so digest reversal is not a concern and
 * key stretching would only add per-request CPU cost.
 */
export function hashSecret(secret: Buffer | string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** Constant-time comparison of a presented secret against a stored digest */
export function verifySecret(secret: Buffer | string, hash: Buffer): boolean {
  return timingSafeEqual(hashSecret(secret), hash);
}

/**
 * Serialize a token as `ecorpus_<id>_<secret>`.
 * The id part allows a primary-key lookup on verification (no table scan).
 */
export function formatToken(id: number, secret: Buffer): string {
  return `${TOKEN_PREFIX}_${Uid.toString(id)}_${secret.toString("base64url")}`;
}

/**
 * Anatomy of a token: `ecorpus_<id>_<secret>` where id is 6 bytes and secret
 * 32 bytes, both base64url. The base64url alphabet itself contains `_`, so the
 * parts are matched by their fixed length, not by splitting on the separator.
 */
const tokenRe = new RegExp(`^${TOKEN_PREFIX}_([-\\w]{8})_([-\\w]{43})$`);

/**
 * Parse a token string into its id and secret parts.
 * @returns null for anything that is not a well-formed eCorpus token
 */
export function parseToken(token: string): ParsedToken | null {
  const m = tokenRe.exec(token);
  if (!m) return null;
  try {
    const id = Uid.toNumber(m[1]);
    const secret = Buffer.from(m[2], "base64url");
    if (secret.length != 32) return null;
    return { id, secret };
  } catch (e) {
    return null;
  }
}

/**
 * The set of scope strings a token may carry.
 * A token grants only what its scopes name (deny-by-default), always within
 * the limits of what its owner can do:
 * - `all`: everything the owner could do in a session — the only scope that
 *   passes the manage/admin-level guards and account management;
 * - `scenes:read|write|admin`: per-scene routes, at the named access level at
 *   most (see {@link sceneCap});
 * - `scenes:create`: scene creation and import (a separate grant, not part of
 *   the read<write<admin hierarchy: combine with `scenes:write` to populate
 *   what was created);
 * - `tasks:read|write`: the tasks API (processing jobs).
 * New scopes may be added to this list; existing scope strings are never
 * reinterpreted.
 */
export const TOKEN_SCOPES: readonly string[] = [
  "all",
  "scenes:read", "scenes:write", "scenes:admin", "scenes:create",
  "tasks:read", "tasks:write",
];

/**
 * The cap a scope set puts on per-scene access (the `canRead`/`canWrite`/
 * `canAdmin` route guards). The cap applies to the *access level* obtained on
 * a scene, never to its visibility: a `scenes:read` token still sees exactly
 * the scenes its owner sees — read-only.
 * `admin` means no restriction. `scenes:create` and `tasks:*` grant other
 * route families and contribute nothing here.
 */
export function sceneCap(scope: readonly string[]): "none" | "read" | "write" | "admin" {
  if (scope.includes("all") || scope.includes("scenes:admin")) return "admin";
  if (scope.includes("scenes:write")) return "write";
  if (scope.includes("scenes:read")) return "read";
  return "none";
}

/**
 * Validate a scope set: a non-empty subset of {@link TOKEN_SCOPES}.
 */
export function isValidScope(scope: any): scope is string[] {
  return Array.isArray(scope)
    && 0 < scope.length
    && scope.every(s => TOKEN_SCOPES.includes(s));
}

/**
 * Parse a space-delimited scope string (RFC6749 §3.3) into a scope set
 */
export function parseScope(scope: string): string[] {
  return scope.split(" ").filter(s => s.length);
}
