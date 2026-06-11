# eCorpus Authentication Redesign

Status: **draft for review** (rev 3)
Date: 2026-06-11

This document proposes an overhaul of eCorpus authentication, in four phases:

1. **Server-side sessions** (sid-only cookies) plus the middleware preparation
   work everything else builds on;
2. **A functional, minimal OAuth2 provider** (authorization-code + PKCE) over an
   opaque revocable token store, replacing HTTP Basic authentication
   (the mechanical test-suite migration and the Basic removal itself are a
   companion commit, Phase 2b);
3. **CSRF/XSS hardening;**
4. **Restriction scopes** (`scenes:read|write|admin|create`, `tasks:read|write`), deny-by-default.

## 1. Goals

Priority-prefixed, as stated:

* **HIGH** — secure server-to-server authentication. A user should be able to
  safely delegate the ability to make authenticated requests to a third-party
  service, without ever giving it his password.
* **HIGH** — third-party app authentication tokens should be inspectable and
  revocable.
* **MED** — third-party app authentication tokens should be scoped (mirror
  existing user levels, at first).
* **MED** — additional CSRF, XSS attack mitigations may be considered in the
  process.
* **LOW** — user-authenticated sessions should be inspectable and revocable.

> Note on the last goal: review of the current implementation (§2.1, §3.2)
> upgraded the *revocation* half of it to foundational. With stateless signed
> cookies, password resets and level demotions do not affect live sessions —
> the same enforcement gap the HIGH goals close for tokens. The session
> *inventory UI* remains LOW; the server-side kill-switch is Phase 1.

### Reference use case

A service that builds a static package of scenes + js bundle + HTML/JS/CSS for
self-hosted, no-network Voyager experiences, using eCorpus for scene creation.
It must:

1. determine whether a user exists on the instance (and their level);
2. download — possibly private — scenes on the user's behalf.

### Decisions already taken

* Delegation uses a full **OAuth2 authorization-code flow with PKCE**, layered
  over an opaque revocable token store. Personal access tokens (PATs) are kept
  as a thin secondary interface over the same store (replacement for scripts
  and CLI usage).
* **HTTP Basic auth is removed completely, with no transition period.** This
  is a breaking change for WebDAV-only clients (see §8).
* **Sessions become server-side**: the cookie carries only an opaque session
  id; identity (including level) is resolved from the database on each
  request.
* **Sequencing: sessions first, then OAuth, then hardening.** The OAuth
  consent endpoint is session-authenticated, so it must be built on the
  reworked session layer, not the current one. The session rework also
  establishes the exact pattern token verification reuses (opaque credential →
  DB lookup → fresh request-scoped identity), and it isolates the two risk
  classes — a
  behavior change for every existing browser user vs. a brand-new attack
  surface — into separate releases.

## 2. Current state

* **Sessions** — [`cookie-session`](https://www.npmjs.com/package/cookie-session)
  stateless signed cookies, configured in `source/server/routes/index.ts`
  (lines 35–41): name `session`, `sameSite: "lax"`, 31-day `maxAge`, signing
  keys rotated from the `keys` DB table. The session payload holds `uid`,
  `username`, `email`, `level`, `expires` and an optional `lang`.
* **Basic auth fallback** — every request may carry
  `Authorization: Basic …`, verified against the scrypt password hash via
  `UserManager.getUserByNamePassword()` (`routes/index.ts:67-83`). This is
  today the *only* server-to-server mechanism: services must hold the user's
  real password, and each request costs a full scrypt computation.
* **Passwordless login links** — HMAC-SHA512-signed payloads
  (`formatLoginPayload`/`parseLoginPayload` in `routes/auth/login.ts`), signed
  with the same `keys` table.
* **User levels** — `NONE=0, USE=1, CREATE=2, MANAGE=3, ADMIN=4`
  (`source/server/auth/User.ts`), enforced by `isUser` / `isCreator` /
  `isManage` / `isAdministrator` middlewares in `source/server/utils/locals.ts`.
* **Per-scene ACLs** — `users_acl` / `groups_acl`; effective access is the
  maximum of user grant, `default_access`, `public_access`, group grants, and
  an admin bypass (`UserManager.getAccessRights()`,
  `auth/UserManager.ts:423-463`). Route guards: `canRead` / `canWrite` /
  `canAdmin` (`locals.ts:188-196`).
* **Hardening posture** — no CSRF protection, no `helmet`, no CSP.
  `x-powered-by` disabled, Handlebars auto-escaping, `Vary: Cookie,
  Authorization` on permission checks. The frontend keeps display-only session
  metadata in `localStorage` (`source/ui/state/auth.ts`); actual authentication
  is the cookie.

### 2.1 Defects in the current session model

1. **Session renewal is unconditional.** `routes/index.ts:60`:

   ```ts
   } else if (now < req.session.expires + sessionMaxAge * 0.66) {
     req.session.expires = now + sessionMaxAge;
   }
   ```

   The preceding branch guarantees `now < expires`, so this condition is
   *always* true: a fresh 31-day `Set-Cookie` is emitted on every request.
   Intended was `req.session.expires < now + sessionMaxAge * 0.66`
   ("renew when less than 66% of lifetime remains").

2. **Basic auth mints sessions.** `routes/index.ts:73-77` copies the
   authenticated user into `req.session`, so every Basic-authenticated
   response sets a 31-day signed session cookie. Applied naively to API
   tokens, this pattern would be a **revocation bypass**: a response cookie
   captured from a token-authenticated request would remain valid for a month
   after the token is revoked. The new design keeps header authentication
   strictly request-scoped.

3. **Stale authority.** All identity claims — including `level` — are read
   from the signed cookie, never re-checked against the database, and renewal
   re-signs the old claims. Consequences, each lasting up to the 31-day
   rolling lifetime:
   * a password change or reset does **not** evict an attacker holding a
     stolen session;
   * a demoted administrator keeps admin powers in any open session
     (`isAdministrator` and the `_perms` admin bypass read the cookie's
     `level`);
   * the only revocation lever is rotating the signing keys, which logs out
     *everyone*.

   OWASP ASVS V3 (session management, level 2) expects sessions to be
   invalidated on password change and to be terminable by the user — both
   impossible with stateless payload cookies. This is what motivates
   server-side sessions in Phase 1.

## 3. Design overview

### 3.1 Identity resolution: request-scoped, set by one middleware

A new middleware module `source/server/utils/authenticate.ts` (replacing
`routes/index.ts:53-83`) resolves the request identity. It is carried in
`res.locals` (next to the existing `access` cache) behind accessors in
`utils/locals.ts` — the same untyped-storage-behind-typed-accessors pattern
as `getLocals`/`getSession`, with no global `Express.Request` type
augmentation:

1. `Authorization: Bearer ecorpus_…` (from Phase 2 on) → verify against the
   token store → identity set via `setUser(res, user, "token", scope)`, with
   the owner's *current* level (the scope may cap per-scene access, §3.4).
   `req.session` is never written.
2. Otherwise, a session cookie carrying a valid `sid` → look up the session
   row, join `users` → identity set with the user's **current** level,
   `setUser(res, user, "session")`.
3. A *presented but invalid* credential (malformed, expired, revoked) → 401.
   An *absent* credential → anonymous, continue.

`getUser(req)` in `utils/locals.ts` becomes the single identity accessor;
`getAuthMethod(res)` its counterpart for the credential type. Call sites
that currently read `req.session` directly switch to it: `isUser`,
`isAdministrator`, `isCreator`, `isManage`, `_perms`, and `GET /auth/` in
`routes/auth/index.ts`. `getSession` remains cookie-only (language
preference and other non-identity state).

### 3.2 Server-side sessions (sid-only cookies)

The `cookie-session` wrapper is retained (tamper-evident, signed with the
existing `keys`), but its payload shrinks to `{sid, lang?}` — an opaque,
high-entropy session id and non-identity state. Everything else lives in a
`user_sessions` table (§5):

* **Login** (`postLogin`, `getLoginPayload` in `routes/auth/login.ts`)
  generates a 32-byte random `sid`, stores `sha256(sid)` plus user, expiry and
  `user_agent`, and writes `{sid}` to the cookie. Hashing means a database
  leak does not yield usable session credentials (same rationale as tokens,
  §3.3). A surrogate `session_id` primary key is the management handle for
  inventory/revocation endpoints, so the credential itself never appears in
  API responses.
* **Per request**, the authenticate middleware resolves
  `sha256(sid)` → session row → user. Expiry is enforced from the DB row
  (`expires_at`); sliding renewal (with the §2.1 condition fixed) updates
  `expires_at` and re-emits the cookie only when less than 66% of the
  lifetime remains, which naturally throttles both the cookie writes and the
  `last_seen` updates.
* **Logout** deletes the row and clears the cookie. Password change deletes
  all of the user's rows (all sessions evicted). Demotion needs no special
  handling: level is read from `users` on every request.
* **Revocation/inventory endpoints**: `GET /auth/sessions` (own),
  `DELETE /auth/sessions/:id` (own or admin), `GET /users/:uid/sessions`
  (admin). The user-facing settings UI for this is optional polish and can
  land any time after.
* Cookies issued before the migration carry no `sid` and are treated as
  expired — one forced re-login at upgrade, in exchange for a complete
  inventory from day one.

Cost: one indexed lookup per cookie-authenticated request. This is the price
of enforceable revocation and fresh authority; it is also exactly the lookup
the token path performs, so the two paths stay symmetrical.

Sessions and API tokens deliberately stay in **two separate tables** despite
the structural similarity: lifetimes, renewal semantics, scopes and
revocation UX all differ, and entangling browser logins with delegated grants
saves nothing.

### 3.3 Opaque token store

One table backs both OAuth2-granted tokens and personal access tokens.

* **Format**: `ecorpus_<id>_<secret>` — `id` is the `token_id` encoded with the
  existing base64url helpers (`source/server/utils/uid.ts`), `secret` is 32
  random bytes, base64url. The constant `ecorpus_` prefix enables
  secret-scanning rules (CI, GitHub push protection).
* **Storage**: `sha256(secret)` as `BYTEA`. The secret has 256 bits of
  entropy, so a single unsalted SHA-256 is the industry-standard choice
  (GitHub PATs use the same construction); scrypt would only add per-request
  CPU cost — which is precisely the DoS problem Basic auth has today.
* **Verification**: lookup by `token_id` primary key (no scan), then
  `crypto.timingSafeEqual` on the two digests. Comparing fixed-length digests
  also sidesteps length-leak concerns.
* **Lifecycle metadata**: `name`, `created_at`, `expires_at`, `last_used_at`
  (updated lazily, throttled to ~5 min, to avoid write amplification),
  optional owning OAuth client. Listable by the owner and by admins →
  *inspectable*; deletable by either → *revocable*.
* **Why not the existing HMAC `keys` machinery**: stateless signed tokens
  cannot be individually revoked or inventoried, and rotating a signing key
  would mass-invalidate every issued token. The `keys` table stays for what it
  is good at: cookie signing and short-lived email login links.

### 3.4 Scopes (`all`, then `scenes:read|write|admin` grants — deny-by-default)

* On the wire and in storage, scope is a **set of strings** (RFC 6749 §3.3:
  space-delimited in requests/responses, `TEXT[]` column). The set
  representation means later `resource:action`-style scopes need no migration
  and no breaking change to the token response. Scope names must not collide
  with OIDC reserved scopes (`openid`, `profile`, `email`, `offline_access`).
* **Scopes never mirror user levels.** An earlier draft issued role-named
  scopes (`use`…`admin`) capping the *effective level*; that was rejected
  because capping the level changes visibility: an admin's `use`-scoped token
  would see a different scene list than the admin does (no `_perms` admin
  bypass), where "use" reasonably reads as "what I always see, read-only".
* **`all`** (the only scope at first, and the default): the token grants
  exactly what its owner could do in a session — identity *and level* are the
  owner's current ones, re-read from the `users` row on every request, so
  demoting a user instantly degrades their tokens and deleting them revokes
  everything.
* **Deny-by-default.** A token grants only what its scopes *name*, always
  within the limits of what its owner can do; everything unnamed is denied.
  The system fails closed: a future capability family is not retroactively
  granted to restriction-scoped tokens already in the wild, and negative
  scopes (`users:none`) never need to exist. Two kinds of guard implement
  this:
  * `requireScope(...names)` on routes a restriction scope may grant
    (scene creation/import → `scenes:create`, the tasks API → `tasks:*`),
    always paired with the user-level guard (`isCreator` checks the *user*,
    `requireScope` checks the *token*);
  * full authority (`isFullAccess`/`isFullUser`) strictly where no
    restriction scope may ever reach: account management (`/auth/sessions`,
    `/auth/tokens`, self-`PATCH /users/:uid` — minting credentials or
    changing the password would escalate a token back to its owner's full
    authority) and the manage/admin-level guards (`isManage`/
    `isAdministrator`: user administration, groups, instance config, OAuth
    client registration, login links).

  `GET /auth/` (identity + level: the packaging service's "does this user
  exist" question) answers any valid token.
* **`scenes:read` | `scenes:write` | `scenes:admin`**: grant the per-scene
  route guards (`canRead`/`canWrite`/`canAdmin`, ie. `_perms` — and the
  per-scene checks of `/tags`), at the named access level at most, never
  restricting *visibility*:
  `effective access = min(computed access — admin bypass included, granted level)`.
  An admin's `scenes:read` token reads every scene the admin sees and writes
  none of them; a denied write is a 401 (insufficient rights), not a 404
  (hidden). A grant never extends: a `scenes:write` token of a user without
  write access still can't write.
* **`scenes:create`**: scene creation (`POST`/`MKCOL /scenes/:scene`) and the
  zip import. A separate grant, not part of the read<write<admin hierarchy
  (it contributes no per-scene access): an import token combines it with
  `scenes:write` to populate what it created. Note the import endpoint runs
  with the owner's rights internally (it may overwrite owner-writable
  scenes): `scenes:create` reads as "may import scenes on my behalf".
* **`tasks:read` | `tasks:write`**: the tasks API (processing jobs) —
  inspection vs creation/deletion/artifact upload. Within it, per-task
  access checks still apply.
* **Documented boundary:** manage/admin operations and account management
  have no restriction scope on purpose — they stay behind full authority
  until a concrete need arises. Adding such grants later (`groups:write`,
  `users:read`, …) is additive: new scope strings, never a reinterpretation
  of existing ones.

### 3.5 OAuth2 layer (authorization code + PKCE)

* **Clients** are registered by administrators (no dynamic registration):
  `client_id`, display name, exact-match `redirect_uris`, and — for
  confidential clients — a hashed `client_secret`. Public clients (e.g. a CLI)
  have no secret.
* **PKCE S256 is mandatory for all clients** (OAuth 2.1 posture).
* **Client authentication at the token endpoint** supports both
  `client_secret_basic` and `client_secret_post`. RFC 6749 §2.3.1 *requires*
  HTTP Basic support for clients holding a password; this is Basic auth
  between the client service and the token endpoint only, and does not
  conflict with removing user-credential Basic auth everywhere else.
* **Authorization codes** are single-use DB rows, ≤ 10 minutes, bound to
  client + `redirect_uri` + `code_challenge` + scope, stored hashed.
* **Consent page** (session-authenticated, served on the Phase 1 session
  layer) shows the client name and the requested scope (§3.4); an invalid
  scope is an `invalid_scope` error redirect.
* **Access tokens** are minted into the shared store (§3.3). Default lifetime
  is a config key (proposal: 30 days). **No refresh tokens in v1**: tokens are
  long-lived but revocable and inspectable; clients re-run the flow on expiry.
  Refresh-token rotation is an additive follow-up (extra column + grant type,
  conventionally gated on an `offline_access` scope) if integrators need
  short-lived access tokens.
* **RFC 8414** discovery document (`/.well-known/oauth-authorization-server`)
  and **RFC 7009** revocation endpoint are included — both cheap, both high
  value for integrators.
* **Compliance summary**: with the above, any off-the-shelf OAuth2 client
  library works unmodified. Omissions (refresh tokens, introspection
  [RFC 7662], dynamic registration [RFC 7591], other grant types answered
  with `unsupported_grant_type`) are all spec-optional.

**Packaging-service flow, end to end** — the service redirects the user to
`/auth/oauth/authorize`; the user consents; the service exchanges the code for
a token. Then `GET /auth/` with `Authorization: Bearer …` answers the
"user exists + level" question (it returns the *effective* identity), and
scene listing/download goes through the existing `/scenes/...` routes, which
all pass `_perms`. **No new read endpoints are needed.**

### 3.6 CSRF hardening

* Keep `sameSite: "lax"`. Email login links (`/auth/payload/:payload`) are
  top-level GET navigations: `strict` would make every externally-linked visit
  appear logged out, for no CSRF gain (lax already withholds the cookie on
  cross-site POSTs).
* Add explicit cookie flags: `httpOnly: true` (today implicit) and
  `secure` in production (the `trust_proxy` setting already exists, so secure
  cookies work behind the reverse proxy). These land in Phase 1 with the rest
  of the cookie work.
* New origin-check middleware (`source/server/utils/csrf.ts`), mounted right
  after `authenticate.ts`, applied to unsafe methods
  (`POST/PUT/PATCH/DELETE/MKCOL/MOVE/COPY`) **only when
  `authMethod === "session"`**:
  * trust `Sec-Fetch-Site` when present (the browser sets it and web content
    can neither forge nor strip it): allow `same-origin` and `none`, reject
    `same-site` and `cross-site`;
  * only when `Sec-Fetch-Site` is absent (older / non-browser client), fall
    back to comparing the `Origin` header against `getHost(req)`.

  The Origin comparison is *not* applied alongside `Sec-Fetch-Site`: a strict
  `Referrer-Policy` makes browsers send `Origin: null` on form navigations, and
  a reverse proxy can make the reconstructed host differ from the public
  origin — either would wrongly reject a genuine same-origin form POST. For the
  same reason `Referrer-Policy` is `same-origin` (not `no-referrer`), which also
  preserves the same-origin `Referer` the user-creation form relies on.

  Bearer-token requests are CSRF-immune by construction and exempt, which
  keeps non-browser clients (including WebDAV-over-token) working. This covers
  the residual lax gaps (older browsers, sibling-subdomain attacks) and the
  urlencoded form-POST endpoints (`/auth/login`, `/auth/logout`,
  `/auth/oauth/authorize`).

### 3.7 XSS / headers hardening

* Add a small, explicit security-headers middleware
  (`source/server/utils/headers.ts`): `X-Content-Type-Options`,
  `Referrer-Policy`, HSTS in production (lands in Phase 1; CSP work is
  Phase 3). A dedicated dependency (helmet) was considered and rejected:
  the embedding requirements below force most of its protections off, and
  what remains is a handful of static strings better declared in one
  readable file.
* **Framing is denied on the `/auth` pages** (`X-Frame-Options: DENY` +
  `Content-Security-Policy: frame-ancestors 'none'`): a clickjacked click on
  the OAuth consent page would grant a token. This can not be a site-wide
  default — scene embedding requires frameability — so it is scoped to the
  auth router (Phase 3).
* A real CSP is a separate follow-up: scene templates inject inline scripts
  (`script` variable in `routes/views/index.ts`, `templates/scene/*.hbs`), and
  `/dist` is intentionally served with `Access-Control-Allow-Origin: *` for
  embeds. Recommended path: `Content-Security-Policy-Report-Only` first.
* **Secret-handling rules**: the access log middleware (`utils/log/index.ts`)
  must never log the `Authorization` header; token-verification errors must
  never echo the presented token; tokens are never accepted in query strings
  (they end up in proxy logs); the PAT/OAuth secret is rendered to the user
  exactly once and never persisted client-side (`localStorage` keeps only
  display metadata, as today).
* With password verification no longer on every request, the remaining scrypt
  brute-force surface is `/auth/login` itself — rate-limit it
  (`express-rate-limit` is already a dependency).

## 4. Schema sketches

A single migration `009-auth.sql` (Up/Down format parsed by
`source/server/vfs/helpers/migrations.ts`), created in Phase 1 and **extended
in place** in Phase 2: the whole series ships as one release, so no deployment
ever runs the migration in its intermediate state.

Phase 1 part:

```sql
CREATE TABLE user_sessions (
  session_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  sid_hash BYTEA NOT NULL UNIQUE,       -- sha256 of the cookie's sid
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT
);
CREATE INDEX user_sessions_user ON user_sessions(fk_user_id);
```

Phase 2 part (appended to `009-auth.sql`):

```sql
CREATE TABLE oauth_clients (
  client_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT NOT NULL UNIQUE CHECK(0 < length(name)),
  secret_hash BYTEA,                    -- NULL for public clients
  redirect_uris TEXT[] NOT NULL,        -- exact-match only
  created_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE api_tokens (
  token_id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  fk_client_id BIGINT REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
                                        -- NULL for personal tokens;
                                        -- deleting a client revokes its tokens
  name TEXT NOT NULL CHECK(0 < length(name)),
  hash BYTEA NOT NULL,                  -- sha256 of the secret part
  scope TEXT[] NOT NULL DEFAULT '{use}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
);
CREATE INDEX api_tokens_user ON api_tokens(fk_user_id);

CREATE TABLE oauth_codes (
  code_hash BYTEA PRIMARY KEY,          -- sha256 of the code
  fk_client_id BIGINT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  fk_user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  scope TEXT[] NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,         -- PKCE S256, mandatory
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 5. API surface

| Endpoint | Method | Auth | Phase | Description |
|---|---|---|---|---|
| `/auth/sessions` | GET | user | 1 | List own active sessions (metadata + `session_id`, never the sid) |
| `/auth/sessions/:id` | DELETE | owner or admin | 1 | Revoke a session |
| `/users/:uid/sessions` | GET | admin | 1 | Inspect a user's sessions |
| `/auth/tokens` | GET | user | 2 | List own tokens (metadata only, never hashes) |
| `/auth/tokens` | POST | user, **not** token-auth | 2 | Create personal token; 201 with show-once secret. Tokens must not mint tokens. |
| `/auth/tokens/:id` | DELETE | owner | 2 | Revoke own token |
| `/users/:uid/tokens[/:id]` | GET/DELETE | admin | 2 | Inspect / revoke any user's tokens |
| `/auth/oauth/authorize` | GET | session (redirects to login) | 2 | Validate client/redirect/scope/PKCE, render consent page |
| `/auth/oauth/authorize` | POST | session (origin-checked) | 2 | Consent grant → 302 with single-use code + `state` |
| `/auth/oauth/token` | POST | client (`client_secret_basic` or `client_secret_post`) + PKCE verifier | 2 | Exchange code for access token; standard OAuth error JSON |
| `/auth/oauth/revoke` | POST | client or bearer | 2 | RFC 7009 token revocation |
| `/.well-known/oauth-authorization-server` | GET | none | 2 | RFC 8414 server metadata |
| `/auth/oauth/clients[/:id]` | GET/POST/DELETE | admin | 2 | Client registration & management |

Removed in Phase 2: the user-credential `Authorization: Basic` handling
(`routes/index.ts:67-83`).

UI touch points: token-management page under the user settings layout
(`templates/layouts/user.hbs` nav + new `templates/user/tokens.hbs`, listing
client names for OAuth-granted tokens), OAuth consent template, admin clients
page (Phase 2); sessions section on the user settings page (optional,
any time after Phase 1).

## 6. Phased implementation plan

### Phase 1 — server-side sessions + preparation work

The foundation everything else builds on, and the release that changes
behavior for existing browser users (one forced re-login).

* Extract `source/server/utils/authenticate.ts` from `routes/index.ts:53-83`;
  introduce the request-scoped identity in `res.locals` behind the
  `setUser`/`getUser`/`getAuthMethod` accessors (§3.1); fix the renewal
  condition (§2.1).
* Migration `009-auth.sql` (user_sessions); sid generation/storage at the session
  creation sites (`postLogin`, `getLoginPayload`); cookie payload shrinks to
  `{sid, lang?}`; per-request session resolution from the DB with fresh
  `level`; logout deletes the row; password change (`patchUser`) deletes all
  of the user's rows.
* Switch `getUser` and the level middlewares in `locals.ts` (+ `GET /auth/`)
  to the request-scoped identity. Basic auth is *temporarily retained* (the
  test suite depends on it until Phase 2 provides tokens) but becomes
  request-scoped: it calls `setUser`, never writes the session — closing the
  §2.1(2) cookie-minting bug now.
* Session inventory/revocation endpoints (`/auth/sessions`).
* Cookie flags (`httpOnly`, `secure` in production), security-headers baseline,
  rate-limit on `/auth/login` and on the Basic path while it survives.
* Tests: new `utils/authenticate.test.ts` and `routes/auth/sessions.test.ts`
  (mocha/supertest on the `tests-common.ts` fixtures): renewal cadence,
  expiry, revoked session → 401, password change evicts sessions, demotion
  takes effect on the next request, no cookie minted by header auth. Run the
  full suite early — the renewal fix changes `Set-Cookie` frequency and
  existing agents may depend on it.

### Phase 2 — minimal OAuth2 provider + token store

* Extend `009-auth.sql` with the OAuth tables; `source/server/auth/Token.ts` (format/parse/hash,
  in the style of `auth/User.ts`); token + client + code methods on
  `UserManager` (`createToken`, `listTokens`, `removeToken`,
  `authenticateToken`, client CRUD, `createAuthorizationCode`,
  `exchangeAuthorizationCode` — single-use via `DELETE … RETURNING`).
* Bearer branch in `authenticate.ts` (before the session branch):
  `timingSafeEqual` on digests, throttled `last_used_at`, expired/revoked →
  401, identity at the owner's current level (§3.4: `all` is the only scope
  at this point). Basic auth survives unchanged next to it until the next
  commit, so the existing test suite stays green.
* OAuth endpoints (`routes/auth/oauth.ts`): authorize (GET validates
  client/redirect/PKCE and renders consent, redirecting anonymous users
  through the existing login page with `?redirect=`; POST issues the code),
  token (both client auth methods, PKCE verify, OAuth error JSON), revoke,
  discovery document. Admin client management + UI page. Consent template.
* Personal token endpoints (`routes/auth/tokens.ts`) and the user tokens UI
  page (show-once secret).
* Tests: full happy path (authorize → consent → code → token → private-scene
  download), PKCE mismatch, redirect_uri mismatch, code reuse, expired code,
  invalid scopes (role names rejected), token-cannot-mint-token, revocation,
  client-deletion cascade. The shared fixture gains a `bearer()` helper that
  mints a token per test user.

### Phase 2b — test-suite migration to tokens, Basic auth removal

The mechanical companion commit, kept separate so the reviewable parts of
Phase 2 stay readable:

* Replace the ~280 `.auth(username, password)` call sites across 32
  `routes/**/*.test.ts` files (plus `source/e2e/eCorpus.setup.ts`) with
  `.set("Authorization", await bearer(user))`.
* **Delete user-credential Basic auth** (the Basic branch of
  `authenticate.ts`); rewrite the login/authenticate tests that asserted
  Basic behavior (Basic headers are now ignored: no login data, no cookie).

### Phase 3 — CSRF/XSS hardening

* `utils/csrf.ts` origin checks (§3.6), mounted after `authenticate.ts`.
* `Content-Security-Policy-Report-Only` experiment (§3.7).
* Frame denial on the `/auth` router (§3.7): OAuth consent clickjacking.
* Log-redaction audit (`Authorization` never logged, tokens never echoed).
* Tests: cross-origin cookie POST → 403, same-origin POST passes, Bearer POST
  without Origin passes.

### Phase 4 — `scenes:*` restriction scopes (deny-by-default)

Purely additive on the `all`-only scope model (§3.4):

* `TOKEN_SCOPES` gains `scenes:read|write|admin`; `sceneCap(scope)` maps a
  scope set to the access level it grants on a scene.
* `authenticate.ts` hands the token's scope to `setUser`. Tokens without
  `all` fail closed: `requireScope(...)` guards the routes a restriction
  scope may grant (scene creation/import → `scenes:create`, tasks →
  `tasks:*`), the manage/admin-level guards and `isMemberOrManage` require
  `isFullAccess(res)`, account management moves to `isFullUser`, and
  self-`PATCH /users/:uid` rejects restricted tokens (password change =
  escalation).
* Within the granted family, `_perms` caps the computed access (admin bypass
  included) at `getSceneCap(res)`; `/tags` applies the same cap to its
  per-scene checks. Sessions and `all`-scoped tokens are uncapped.
* Scope selector on the user tokens UI page; OAuth clients may request the
  new scopes (discovery document advertises them).
* Tests: grant on level not visibility (admin `scenes:read` token reads a
  private scene, write → 401 not 404), `scenes:write` vs permission changes,
  no extension of the owner's rights, deny-by-default sweep over level
  guards / account management / tasks / admin, identity endpoint stays
  available, tag writes capped.

### Verification (end of implementation)

1. Create a personal token in the UI → `curl -H "Authorization: Bearer …"
   /auth/` returns the effective identity; download a private scene; revoke →
   same call returns 401.
2. Register an OAuth client → simulate the packaging service: authorize in a
   browser, consent, exchange the code (PKCE) via curl, download a private
   scene, revoke from the user token page → 401.
3. Log in from two browsers, revoke one session from the other → the revoked
   browser is logged out on its next request; change the password → both are.
4. Demote a logged-in admin → their next request no longer passes
   `isAdministrator`.
5. Cross-origin POST with a session cookie (forged `Origin`) → 403; the same
   request with a Bearer token → passes.
6. Full mocha suite plus the Playwright e2e suite (`source/e2e`).

## 7. Risks

* **Token- or Basic-derived cookies bypassing revocation** — prevented
  structurally by the request-scoped identity (Phase 1 closes this before
  tokens exist).
* **Hot-path cost** — one indexed lookup per authenticated request (session
  or token); no scrypt outside `/auth/login`. `last_seen`/`last_used_at`
  writes are throttled.
* **Timing** — PK/unique-index lookup + `timingSafeEqual` on digests.
* **Secret leakage** — never log `Authorization`; never echo credentials in
  errors; no tokens in query strings; show-once display; sid and token
  secrets stored only as digests.
* **Unnamed capabilities are denied** (§3.4, deny-by-default): adding a route
  family means deciding which scope grants it — every privileged route needs
  a token-side guard (`requireScope`, `isFullUser`, or a full-gated level
  guard), never `isUser` or `isCreator` alone.
  Per-scene token restriction (`fk_scene_id`) remains a possible follow-up.
* **Set-Cookie behavior change** from the renewal fix and sid-only payload —
  existing supertest agents may rely on current behavior; caught by running
  the suite in Phase 1.
* **Stale `user_sessions` / `oauth_codes` rows** — expired rows accumulate;
  sweep them with the existing `TaskScheduler` (housekeeping, not security:
  expiry is enforced on read).

## 8. Breaking changes & open questions

Breaking:

* **HTTP Basic auth removed (Phase 2) with no transition.** WebDAV clients
  that only speak Basic lose access; Bearer tokens are the replacement. Must
  be prominent in release notes.
* Pre-existing session cookies are invalidated when Phase 1 ships (one forced
  re-login).

Open questions to settle while iterating on this document:

1. Default and maximum access-token lifetime (proposal: default 30 days,
   instance-configurable maximum)?
2. Should `manage`-level users be allowed to register OAuth clients, or
   admins only (proposal: admins only in v1)?
3. Are refresh tokens needed in v1, or is "long-lived revocable access token"
   acceptable for the known integrators (proposal: defer)?
4. Should personal-token creation be restricted by level (e.g. `use`-level
   accounts may not create tokens)?
5. Per-scene token restriction (`fk_scene_id`): v1 or follow-up
   (proposal: follow-up)?
6. Session lifetime: keep 31 days now that sessions are revocable and carry
   fresh authority, or shorten (proposal: keep, revisit after Phase 1)?
