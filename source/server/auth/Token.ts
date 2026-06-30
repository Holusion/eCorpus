import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Constant prefix of every eCorpus API token.
 * Makes tokens recognizable to secret-scanning tools (CI hooks, GitHub push protection).
 */
export const TOKEN_PREFIX = "ecorpus";

/** Default lifetime of an OAuth2-granted access token: 30 days, in milliseconds */
export const DEFAULT_TOKEN_LIFETIME = 30 * 24 * 60 * 60 * 1000;

/** Maximum lifetime of an authorization code (RFC6749 recommends 10 minutes maximum) */
export const CODE_LIFETIME = 10 * 60 * 1000;

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
 * Serialize a token as `ecorpus_<secret>`. No id is embedded: verification
 * looks the token up by `sha256(secret)` (a unique index), so nothing about
 * the token's number or creation order leaks, and the string is shorter.
 */
export function formatToken(secret: Buffer): string {
  return `${TOKEN_PREFIX}_${secret.toString("base64url")}`;
}

/**
 * Anatomy of a token: `ecorpus_<secret>` where secret is 32 bytes base64url
 * (43 chars). Matched by fixed length rather than by splitting on `_`, since
 * the base64url alphabet itself contains `_`.
 */
const tokenRe = new RegExp(`^${TOKEN_PREFIX}_([-\\w]{43})$`);

/**
 * Parse a token string into its 32-byte secret.
 * @returns the secret, or null for anything that is not a well-formed eCorpus token
 */
export function parseToken(token: string): Buffer | null {
  const m = tokenRe.exec(token);
  if (!m) return null;
  const secret = Buffer.from(m[1], "base64url");
  if (secret.length != 32) return null;
  return secret;
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

export interface ApiToken {
  /** Management handle: safe to expose, the token secret is only stored hashed */
  id: number;
  uid: number;
  /** OAuth2 client this token was granted to, or null for personal access tokens */
  clientId: number | null;
  clientName?: string | null;
  name: string;
  scope: string[];
  created: Date;
  expires: Date | null;
  lastUsed: Date | null;
}

export interface StoredToken {
  token_id: string | number;
  fk_user_id: string | number;
  fk_client_id: string | number | null;
  client_name?: string | null;
  name: string;
  hash: Buffer;
  scope: string[];
  created_at: Date;
  expires_at: Date | null;
  last_used_at: Date | null;
}

export function deserializeToken(t: StoredToken): ApiToken {
  return {
    id: typeof t.token_id === "string" ? parseInt(t.token_id, 10) : t.token_id,
    uid: typeof t.fk_user_id === "string" ? parseInt(t.fk_user_id, 10) : t.fk_user_id,
    clientId: t.fk_client_id == null ? null : (typeof t.fk_client_id === "string" ? parseInt(t.fk_client_id, 10) : t.fk_client_id),
    clientName: t.client_name ?? null,
    name: t.name,
    scope: t.scope,
    created: t.created_at,
    expires: t.expires_at,
    lastUsed: t.last_used_at,
  };
}
