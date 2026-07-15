import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { UserRole } from "./User.js";

/**
 * Constant prefix of every eCorpus API token.
 * Makes tokens recognizable to secret-scanning tools (CI hooks, GitHub push protection).
 */
export const TOKEN_PREFIX = "ec";

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
 * Serialize a token as `ec_<secret>`. No id is embedded: verification
 * looks the token up by `sha256(secret)` (a unique index), so nothing about
 * the token's number or creation order leaks, and the string is shorter.
 */
export function formatToken(secret: Buffer): string {
  return `${TOKEN_PREFIX}_${secret.toString("base64url")}`;
}

/**
 * Anatomy of a token: `ec_<secret>` where secret is 32 bytes base64url
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
 * Every concrete scope string (after expansion). This is the
 * vocabulary authorization is expressed in: a request's *effective* scope set
 * (see `utils/locals.ts`) is always a subset of these, and every route guard
 * asks "is scope S in that set?".
 *
 * Hierarchical families (`read < write < admin`) expand downward: holding
 * `scenes:write` implies `scenes:read` (see {@link expand}).
 *
 * The top level of the `account` and `users` families is escalation-critical
 * (see {@link NON_MINTABLE_SCOPES}): a session holds it but no delegated
 * credential ever can.
 *
 * New scopes may be added here; existing scope strings should not be reinterpreted.
 */
export const CONCRETE_SCOPES = [
  "corpus:read", "corpus:write",
  "scenes:read", "scenes:write", "scenes:admin",
  "tasks:read", "tasks:write", "tasks:admin",
  "users:read", "users:write", "users:admin",
  "groups:read", "groups:write", "groups:admin",
  "instance:read", "instance:write",
  "account:read", "account:write", "account:admin",
] as const;

export type Scope = typeof CONCRETE_SCOPES[number];

/**
 * The universal scope ladder: for any `family:level` scope, holding a
 * level implies every lower one (`read ⊆ write ⊆ admin`). Every scope in the
 * vocabulary sits on it; a scope with another suffix would be standalone (no
 * ladder). This single rule is the source of the hierarchy; families do not
 * declare it individually (see {@link expand}).
 */
const SCOPE_LADDER = ["read", "write", "admin"] as const;

/**
 * Scopes that would let a credential "escalate itself" full authority,
 * so they can never be delegated: not mintable as a
 * token, not requestable as an OAuth scope, and not part of `all`.
 * Only a session (which carries no `token.scope` factor) ever holds these.
 *
 * Non-mintability is a property of the *scope*, orthogonal to the ladder: the
 * lower levels of these families stay mintable.
 */
export const NON_MINTABLE_SCOPES: readonly string[] = ["account:admin", "users:admin", "instance:write"];

/**
 * The scope strings a token or OAuth grant may carry: every concrete scope
 * except the non-mintable ones, plus the `all` shorthand. This is what
 * {@link isValidScope} accepts and what the OAuth metadata advertises.
 * `all` deliberately excludes the non-mintable scopes — an `all` token still
 * cannot mint further tokens, change its owner's password, or fabricate users
 * it could sign in as.
 */
export const TOKEN_SCOPES: readonly string[] = [
  "all",
  ...CONCRETE_SCOPES.filter(s => NON_MINTABLE_SCOPES.indexOf(s) === -1),
];

/**
 * Scopes every *credential* carries whatever it was minted with. Requesting
 * them is a no-op (but valid: an OAuth client may ask for `corpus:read` alone
 * to get a pure identity token). Deliberately NOT part of {@link PUBLIC_SCOPES}:
 * anonymous requests hold no credential, so `corpus:read` separates "any
 * identified requester" from "anyone".
 */
const IMPLICIT_SCOPES: readonly string[] = ["corpus:read"];

/**
 * {@link expand} for a delegated credential (`token.scope`): adds the
 * {@link IMPLICIT_SCOPES} baseline. This is the single expansion the
 * authenticate middleware applies to a verified token; sessions carry no
 * credential restriction at all (`credentialScopes = null`).
 */
export function expandCredential(scopes: readonly string[]): Set<string> {
  return expand([...scopes, ...IMPLICIT_SCOPES]);
}

/**
 * Resolve a scope set into the full set of concrete scopes it grants:
 * expand each `read < write < admin` ladder downward, and expand `all` into
 * every mintable concrete scope. Membership in the result is the single
 * primitive every guard is built on (plain set containment). Replaces the
 * hand-rolled `sceneCap`/`min(access,cap)`/`tasks:read|write` or-lists.
 */
export function expand(scopes: readonly string[]): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => {
    if (out.has(s)) return;
    out.add(s);
    //Derive the down-ladder from the `family:level` suffix: a level implies
    //every lower one. A standalone scope (no colon, or a non-ladder suffix like
    //`create`/`grant`) has rung -1, so the loop adds nothing.
    const i = s.indexOf(":");
    const rung = i === -1 ? -1 : (SCOPE_LADDER as readonly string[]).indexOf(s.slice(i + 1));
    for (let j = 0; j < rung; j++) out.add(`${s.slice(0, i)}:${SCOPE_LADDER[j]}`);
  };
  for (const s of scopes) {
    if (s === "all") {
      for (const c of CONCRETE_SCOPES) if (NON_MINTABLE_SCOPES.indexOf(c) === -1) add(c);
    } else {
      add(s);
    }
  }
  return out;
}

/**
 * The per-resource access cap an effective scope set implies for one family:
 * the highest rung of `family` present in the set (the level a resource-ACL
 * requester may reach; the ACL still decides on *which* resource). Read off
 * the effective (expanded) credential set — `maxFamilyScope(expand(scope), f)`.
 */
export function maxFamilyScope(scopes: ReadonlySet<string>, family: string): "none" | "read" | "write" | "admin" {
  for (let i = SCOPE_LADDER.length - 1; 0 <= i; i--) {
    if (scopes.has(`${family}:${SCOPE_LADDER[i]}`)) return SCOPE_LADDER[i];
  }
  return "none";
}

/**
 * Validate a scope set for minting/granting: a non-empty subset of
 * {@link TOKEN_SCOPES} (i.e. mintable scopes only — `account:admin` and any
 * other non-mintable scope are rejected).
 */
export function isValidScope(scope: any): scope is string[] {
  return Array.isArray(scope)
    && 0 < scope.length
    && scope.every(s => TOKEN_SCOPES.includes(s));
}

/**
 * The scope set an anonymous request holds. Anonymous is *not* unscoped: it
 * carries a small public set, so an `access:"read"` route (which derives
 * `scenes:read`) still lets an anonymous reader through to a public scene's
 * ACL. A future non-public scope simply cannot leak here.
 */
export const PUBLIC_SCOPES: ReadonlySet<string> = expand(["scenes:read"]);

/**
 * The minimal scopes each user level grants — **un-expanded** (ladder tops only:
 * `scenes:admin`, not `scenes:read/write/admin`), cumulative up the levels. The
 * scene ACL (`access`) still gates *which* scene, so `scenes:admin` at `use`
 * means "may act on scenes they have the ACL for", not "on every scene".
 */
const USE_SCOPES = ["corpus:read", "scenes:admin", "tasks:read", "account:admin"];
const CREATE_SCOPES = [...USE_SCOPES, "corpus:write", "tasks:admin"];
const MANAGE_SCOPES = [...CREATE_SCOPES, "groups:admin"];
const LEVEL_SCOPES: Record<UserRole, readonly string[]> = {
  //"none" is the anonymous floor plus identity — the UI never assigns it as a
  //stored level. Stored via the raw API it acts as a quarantine: the account
  //may sign in but holds no account:* scope, so it cannot mint tokens, revoke
  //sessions or rotate its own credentials; an administrator does that for it.
  none: ["corpus:read", "scenes:read"],
  use: USE_SCOPES,
  create: CREATE_SCOPES,
  manage: MANAGE_SCOPES,
  admin: ["all", ...NON_MINTABLE_SCOPES], // every mintable scope + the non-mintable top rungs
};

/**
 * The scopes a user of the given level may *exercise*, as the **raw,
 * un-expanded** generating set (see {@link LEVEL_SCOPES}). Callers must
 * {@link expand} it before membership-testing — the `readonly string[]` return
 * type makes a bare `.has()` a compile error — so the `read ⊆ write ⊆ admin`
 * inclusion rule is produced solely by `expand`, never mis-declared here.
 *
 * The level is read live from the DB each request, so a demotion takes effect
 * immediately even for a long-lived token.
 */
export function levelScopes(level: UserRole | null | undefined): readonly string[] {
  return LEVEL_SCOPES[level ?? "none"] ?? LEVEL_SCOPES.none;
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
