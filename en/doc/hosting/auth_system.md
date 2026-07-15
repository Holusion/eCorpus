
# eCorpus authentication & authorization system

This document explains the authorization model of the eCorpus server: the
concepts and their names, the scope conventions, the token/OAuth machinery, and how to actually use it with the `policy()` middleware.

For an actual guide on how to use the authentication API, the [API documentation](./api) or [OpenAPI specification](./apiDoc) might be better starting points.

Implementation lives in four places:

| What | Where |
|---|---|
| Scope vocabulary, ladder, expansion, token format | [source/server/auth/Token.ts](source/server/auth/Token.ts) |
| `policy()` and the other guards, request-scoped auth state | [source/server/utils/locals.ts](source/server/utils/locals.ts) |
| Identity resolution (Bearer token / session cookie) | [source/server/utils/authenticate.ts](source/server/utils/authenticate.ts) |
| User levels, scene ACL storage, sessions, tokens, OAuth grants | [source/server/auth/User.ts](source/server/auth/User.ts), [source/server/auth/UserManager.ts](source/server/auth/UserManager.ts) |
| OAuth2 endpoints | [source/server/routes/auth/oauth.ts](source/server/routes/auth/oauth.ts) |

---

## The model

Every request's **effective authority** is the *intersection of three factors*:

1. **the level** — what the *user* may do, derived from their **account**'s level
   (`none < use < create < manage < admin`), read live from the database on
   every request;
2. **the credential** — what was *delegated* to the thing presented in the
   request: a token carries a frozen **scope** list; an interactive session carries *no
   restriction* (the user's full authority);
3. **the resource ACL** — what this **user** may do **on** *this particular resource*
   (per-scene access rows, task ownership, group membership…).

A route passes only when all applicable factors allow it. `policy()` is the
single middleware that evaluates this conjunction.

---

## Vocabulary

The code use several short names. They are **not** interchangeable:

### level / role

The account-wide **user level** (`UserRole` in `User.ts`):
`none < use < create < manage < admin`. 
Each level *generates a scope set* (`LEVEL_SCOPES` in `Token.ts`) and
routes are gated on scopes.

The `/ui/` views are gated behind the **user level**, since they are accessible only for "session" credentials and typically hold mixed content that can't easily be expressed as individual scopes.

### scope

A **scope** is a string like `scenes:write` naming a kind of operation —
independent of any particular resource. This is OAuth's word (RFC6749 §3.3)
and the only one we use for this dimension. The full vocabulary is
`CONCRETE_SCOPES` in `Token.ts`; a **concrete scope** is a member of that
list, as opposed to shorthands like `all` that `expand()` resolves into
concrete ones. Scopes appear in three roles:

- **account scopes** — what the user's level grants (`levelScopes(level)`),
  recomputed from the live level each request. For an anonymous request this
  is `PUBLIC_SCOPES` (never the empty set — see §3);
- **credential scopes** — what a token was minted with (`token.scope`,
  frozen at mint time), or `null` when no restricting credential was
  presented: a session, **or an anonymous request**. Credential checks are
  restrictions, so `null` passes all of them — anonymous is stopped by the
  *account* half (or by the ACL), never by the credential half;
- **effective scopes** — conceptually `account ∩ credential`; guards check the
  two halves separately because the failure modes differ (401 vs 403, see §5).

**Cap** (as in `accessCap`) means *ceiling*, nothing else: the highest rung of
a family a credential holds caps the access level a token may exercise on a
resource, whatever the ACL would grant.

### credential

**credential** is the umbrella term for whichever auth method was used for this session,
as returned by `getAuthMethod(res)`: `"session" | "token" | null`.

- A **session** is the browser credential: an opaque `sid` in a cookie, looked
  up server-side in `user_sessions`, with sliding renewal. A session carries
  the user's **full authority** (`credentialScopes = null`).
- A **token** is the API credential: `Authorization: Bearer ec_…`, looked up
  by hash in `api_tokens`. A token is always **scoped**: it delegates a subset
  of its owner's authority, and that subset is frozen at mint time.


### access / ACL

**access** (an *access level*) is the per-resource dimension:
`none < read < write < admin`. It answers *"what may this user do on this
scene / task / group?"*. It has two representations in `UserManager.ts`:

- **`AccessLevel`** — a numeric enum (`None=0 < Read < Write < Admin`,
  matching the integers the `*_acl` tables store). This is the in-memory
  currency: everything resolved, capped or compared is an `AccessLevel`,
  with plain operators (`AccessLevel.Write <= access`).
- **`AccessType`** — the wire string (`"none" | "read" | "write" | "admin"`),
  used only where HTTP or a template is touched: JSON bodies and responses,
  query params, rendered pages. `toAccessLevel()` parses (`null`, an ACL
  patch's "remove" value, parses as `None`); `fromAccessLevel()` serializes.

The **ACL** (access-control list) is the stored structure access is resolved
*from*. For scenes it is the union of: the per-user `users_acl` rows,
per-group `groups_acl` rows (via membership), the scene's `default_access`
(any authenticated user) and `public_access` (anyone) — the *highest*
applicable level wins (`UserManager.getAccessRights` resolves one requester;
`UserManager.getAcl` lists the whole thing). Instance admins bypass the ACL
entirely (but not their credential's cap).

Rule of thumb: **scopes are global verbs, access is a per-resource level**. A
token scoped `scenes:write` does not grant write on any scene; it *allows the
ACL check to happen* up to `write` on scenes the user could already write.


---

## 3. Scope conventions

### Anatomy: `family:rung`

A scope is `<family>:<level>`. The part before the `:` is the **family** (or
"area"); the part after is generally a level on the universal ladder.

### The scope ladder

Most families have a standard set of nested levels: `read ⊂ write ⊂ admin` and **holding a level implies every level below it**.

> This is enforced in exactly one place — `expand()` in `Token.ts`
> which resolves any scope list into the full set of concrete scopes it grants.
> Guards then reduce to plain set membership: *"is scope S in the expanded set?"*.


It's not required for every standard level to exist within a family,
nor is it forbidden for a family to have a custom "level" outside of those. 
A scope whose suffix is not on the ladder would be standalone (implies
nothing); none exist today.


Two families deliberately stop at `write` (`corpus`, `instance`) where `admin` wouldn't make sense. New *families* can be added freely.

### The scope families

| Family | Meaning | Notes |
|---|---|---|
| `corpus` | The collection as a whole, as opposed to any one scene. | `corpus:read` = "is a recognized user of this instance" — the identity baseline (see below). `corpus:write` = may add scenes to the collection. Collection metadata like tags has no family of its own: tag edits gate on `corpus:read` and re-check each scene's ACL in the handler. |
| `scenes` | Scene *content* (documents, files, per-scene ACL). | `scenes:<rung>` means "may reach `<rung>` on scenes **the ACL grants**", not "on every scene". `scenes:admin` does **not** imply creation — that's `corpus:write`; the family split exists precisely so that "admin over my own scenes" (which every `use`-level user has) doesn't leak creation rights. |
| `tasks` | Background tasks (imports, batch jobs). | Access to one task derives from its scene's ACL, or ownership. |
| `users` | *Other* people's accounts: inventory, provisioning, credential administration. | `users:admin` (login links for arbitrary users, creating admins) is non-mintable. |
| `groups` | Group inventory and membership. | `groups:write` is reserved for a future per-group role; no route uses it yet. |
| `instance` | Server configuration and monitoring. | `instance:read` = stats/config inventory (mintable — the monitoring use case). `instance:write` = config rewrite, OAuth client registry (non-mintable). |
| `account` | One's **own** account: sessions, tokens, grants, password/email. | `account:read`/`write` = list/revoke own credentials. `account:admin` = *mint* credentials & change own password/email (non-mintable). |

> `users` vs `account`: `users:*` is administration of *other* accounts;
> `account:*` is self-service on *your own*.

### Special scope sets

- **`all`** — mintable shorthand expanding to every mintable concrete scope.
  An `all` token is *not* a session: it still lacks the non-mintable scopes.
- **`NON_MINTABLE_SCOPES`** (`account:admin`, `users:admin`, `instance:write`)
  — scopes whose possession would let a credential *escalate back to its
  owner's full authority* (mint a new token, obtain a login link, redirect
  login-link email through `smart_host`…). They can never be put on a token or
  OAuth grant; only a session ever holds them. Gating a route on one of these
  is the idiom for **"session-only"**.
- **`IMPLICIT_SCOPES`** (`corpus:read`) — carried by *every* credential
  regardless of minted scope. Hence `policy({scope: "corpus:read"})` means
  **"any identified requester"**: every user level holds it, every token
  carries it, anonymous does not.
- **`PUBLIC_SCOPES`** (`expand(["scenes:read"])`) — the **account** scopes of
  an **anonymous** request (its credential scopes are `null`, like a session's:
  there is no credential to restrict anything). Anonymous is *not* unscoped:
  it holds `scenes:read` so that an `access: "read"` scene route still
  resolves the ACL (where `public_access` decides). It does *not* hold
  `corpus:read`.

### Default scopes

Scopes granted to a user per his `level`. A user's `session` will hold those. A `token` may hold any subset of this.

Cumulative, un-expanded (ladder tops only):

| Level | Adds |
|---|---|
| `none` | `corpus:read`, `scenes:read` — a quarantine level: may sign in, but holds no `account:*` scope, so cannot mint/rotate its own credentials. Never assigned by the UI. |
| `use` | `corpus:read`, `scenes:admin`, `tasks:read`, `account:admin` |
| `create` | + `corpus:write`, `tasks:admin` |
| `manage` | + `groups:admin` |
| `admin` | `all` + the non-mintable scopes (everything) |

> Remember `scenes:admin` at `use` means "may reach admin *on scenes their ACL
> grants*" — the ACL still decides *which* scene.

---

## Tokens, sessions and OAuth

The technical implementation

### Identity resolution (`utils/authenticate.ts`)

Mounted once, before every route. It checks, in this order:

1. `Authorization: Bearer ec_…` → lookup in `api_tokens` by `sha256(secret)`.
   A presented-but-invalid token is a **401**, never a fall-through to
   anonymous.
2. Session cookie `sid` → lookup in `user_sessions`. Expired → 401 + cookie
   cleared. Sliding renewal when less than 66% of `sessionMaxAge` remains.
3. Neither → anonymous.

> `Authorization: Basic` (user passwords on API calls) is **not supported**:
> services authenticate with revocable, scoped tokens. (The only Basic auth left
> is OAuth *client* authentication on `/auth/oauth/token`.)

Identity — including the level — always comes from the database, so
revocations, demotions and password changes take effect on the next request
even for long-lived credentials. The resolved state is request-scoped in
`res.locals`; read it with `getUser(req)` / `getAuthMethod(res)` /
`getAccountScopes(res)` / `getCredentialScopes(res)`.

### Token anatomy (`auth/Token.ts`)

There are two _kind_ of tokens:

- **Personal access tokens** (`clientId = null`) — minted by the user from
  `POST /auth/tokens`. Minting requires `account:admin`, which is non-mintable
  ⇒ **only a session can mint a token; no token can ever create another
  token** — the containment property the whole design leans on.
- **OAuth-granted tokens** (`clientId` set) — minted by the code exchange
  below, default lifetime 30 days. Revoking a grant or deleting a client
  cascades to its tokens.

Both share the `api_tokens` table. and the same base format:

- Format: `ec_<43 base64url chars>` — a constant prefix (secret-scanner
  friendly) plus a 32-byte random secret. Nothing else is embedded: no id, no
  claims. Verification is a lookup by `sha256(secret)` (unique index) +
  constant-time compare.
- Stored as a single unsalted sha256 — fine for high-entropy random secrets
  (unlike passwords, no stretching needed).
- The secret appears exactly once, in the mint response. Everything else
  (listing, revocation) works on the numeric `id`.
- A token row carries: owner `uid`, `scope` (string list), optional `expires`,
  optional `clientId` (see below), `lastUsed`.

---

## Guarding a route: `policy()`

`policy(options)` in `utils/locals.ts` is **the** route guard.
Everything exception should be documented (eg: the  `/ui/` views).

```ts
policy({
  scope?: string | null,   // scope gate (default: null = none)
  access?: "read" | "write" | "admin" | null,  // resource-ACL gate (default: null = none)
  on?: "scene" | "task" | "user" | "group",    // what `access` applies to (default "scene")
})
```

### What each option does

Options are checked **in this order**

#### 1. scope policy

A **scope** the request's authority must include. Checked in
two halves, in order:

1. **account**: whether the user _can_ do this
   `scope ∉ expand(levelScopes(level))` → **401 Unauthorized**
2. **credential**: whether the *token* has delegation to do this
   `token ∉ expand(token.scope)` → **403 Forbidden** with `WWW-Authenticate: Bearer error="insufficient_scope"`

> The ordering matters: the scope is checked *before* the ACL so a too-narrow
> credential gets a uniform 403 and can't check for existence.

#### 2. access policy

The minimum resource-ACL level, resolved on the resource named by a **fixed route parameter** per target 

See the `on` table below for targets.

Access policy check is a two-steps process:

1. a **derived scope check** on the credential only: `access: <level>` requires
   the credential to hold `<family>:<level>` for the target's scope family —
   `scenes:*` for `on: "scene"`, `tasks:*` for `"task"`, `groups:*` for
   `"group"`. Otherwise answers with 403 `insufficient_scope`. `on: "user"` has **no**
   scope family (its check is identity-shaped), so it derives nothing. The *account* is
   deliberately not gated on the derived scope — see "existence hiding" below.
2. the **ACL resolution** itself (`_access`): **instance admins bypass it**; for
   everyone else the resolver computes the **requester's level on the resource**.
   The result is **capped** by the credential's highest level in the same
   family (`accessCap`; family-less `user` is uncapped), then compared to
   `access`.

the resolved (capped) level is **cached in `res.locals.access`** for the
handler, and `Vary: Cookie, Authorization` is set.

It is a numeric `AccessLevel`, so handlers branch on it with plain
comparisons (`AccessLevel.Admin <= res.locals.access`), and `effectiveAccess()`
re-applies the credential cap when *displaying* access. Templates receive it
through the render locals: the `accessLevel` Handlebars helper accepts the
numeric form as well as the wire string.

> the resolvers live in the `RESOLVERS` map in `utils/locals.ts`

Failure shape depends on the target: **scenes and groups hide existence** —
insufficient access answers **404** on a GET, or on any method when the
requester has no access at all (`none`), so private resources are
indistinguishable from absent ones. An unsafe method from a requester who
*can* read the resource — e.g. a DELETE from a `read` holder — answers **401**
(nothing left to hide). Tasks and users answer 401 for any insufficiency. A
missing resource is a 404 from the resolver either way.

#### 3. on policy

_What_ we are checking access for.

| target | route param | scope family | resolver semantics |
|---|---|---|---|
| `scene` (default) | `:scene` | `scenes` | `getAccessRights`: max of user ACL, group ACL, `default_access` (if authenticated), `public_access`; admin ⇒ admin. |
| `task` | `:id` | `tasks` | owner ⇒ admin; else the task's scene ACL; anonymous rejected before the lookup (no id oracle). |
| `user` | `:uid` | — | `write` = yourself, `admin` = an instance admin — identity-shaped, no scope family. |
| `group` | `:group` | `groups` | member ⇒ read; level ≥ manage ⇒ admin. |

The param name is not configurable: a route using `access` must declare the
matching parameter under that exact name.


### Common cases

#### access: null

`null` is already the default, so it changes nothing mechanically. Writing it
out is a **declaration of intent**: *"this route touches no `:scene`-like
resource; the scope alone is the whole decision"*
You'll see it on account/user/token routes:

```ts
router.get("/tokens", policy({ scope: "account:read", access: null }), …);
```

Holding the scope is enough here because the actual account acted-on is  _by definition_ our own.

#### scope: null

`scope: null` next to an `access` says *"no scope beyond what
`access` derives; the ACL is the whole decision"* — the pattern for scene
content routes, where anonymous must still reach the ACL of public scenes:

```ts
router.get("/:scene", policy({ scope: null, access: "read", on: "scene" }), …);
```

`policy()` with both `access` and `scope` `null` would guard nothing; for a route that is
*deliberately* open, use the greppable `policy.public()` instead.

### Choosing your options — a recipe box

| Intent | Expression |
|---|---|
| Anyone, including anonymous | `policy.public()` |
| Any identified requester (any level, any token) | `policy({scope: "corpus:read"})` |
| Read a scene (public scenes stay anonymous-readable) | `policy({scope: null, access: "read"})` |
| Edit / admin a scene | `policy({scope: null, access: "write" \| "admin"})` |
| Create a scene | `policy({scope: "corpus:write", access: null})` |
| Act on a task | `policy({access: "read" \| "admin", on: "task"})` |
| Group read (members) / admin | `policy({access: "read" \| "admin", on: "group"})` |
| Manage own credentials | `policy({scope: "account:read" \| "account:write", access: null})` |
| **Session-only** operation (no token may ever do this) | gate on a non-mintable scope: `account:admin`, `users:admin` or `instance:write` |
| Self-or-admin on a user account | `policy({scope: …, access: "write", on: "user"})` |
| Identity check *and* scene ACL | both: `policy({scope: "corpus:read", access: "read"})` (e.g. reading a scene's ACL: anonymous readers of a public scene must not enumerate its users) |
| Two unrelated scopes (AND) | chain two guards: `policy({scope: "a:x"}), policy({scope: "b:y"})` — `scope` takes a single string. (Credential-only AND on one middleware: `requireScope("a:x", "b:y")`.) |
| Grant A **or** fallback B (e.g. rate-limited anonymous path) | `either(policy({scope: …}), rateLimit(…))` — 401/403 from one branch falls through to the next (§6) |
| Batch route acting on many resources | gate identity/credential up-front, re-check each item in the handler with `getAccessRights` + `effectiveAccess` (see `routes/tags/patch.ts`, `POST /scenes`) |

### Status-code contract (what clients can rely on)

| Situation | Answer |
|---|---|
| No/invalid credential where one is needed | 401 |
| Account level too low for `scope` | 401 (same as anonymous — no info leak) |
| Credential not delegated `scope` (account has it) | 403 `insufficient_scope` + `WWW-Authenticate` |
| ACL too low on a scene/group: GET, or no access at all | 404 (existence hidden) |
| ACL too low on a scene/group: unsafe method, requester can read | 401 |
| ACL too low on a task/user | 401 |
| Resource doesn't exist | 404 |

---

## 6. The deliberate exceptions

A few guards other than `policy()` survive, each for a stated reason (all in
`utils/locals.ts`):

- **`policy.public()`** — a no-op, but greppable: "this route is open on
  purpose", as opposed to a forgotten guard.
- **`either(...handlers)`** — combinator, not a guard: tries each middleware
  in order; a 401 *or 403* from one branch falls through to the next instead
  of vetoing the request (any other error propagates). Used where an
  authorization grant and an alternative path (e.g. a strict rate limit)
  are both acceptable: `either(policy({scope: "users:write"}), rateLimit(…))`.
- **`requireScope(...scopes)`** — credential-only gate (ignores level). Used
  once: bulk scene import (`POST /scenes`) requires the *token* to carry
  `corpus:write scenes:write` up-front while the detached task re-checks each
  scene's ACL/level as it goes. Prefer `policy()` unless you specifically need
  "gate the delegation, not the account".
- **`requireLevel(min)`** — level gate for server-rendered `/ui` pages only.
  Views aggregate content across scope families, so they're gated on *who the
  user is* (and require full authority: a session or an `all` token). JSON API
  routes must use `policy()` instead, which distinguishes 401 from 403.

Handler-level helpers, once past the guard:

- `getUser(req)` — the resolved identity (`SafeUser | null`).
- `res.locals.access` — the `AccessLevel` a `policy({access})` resolved
  (already capped by the credential); use it to branch inside a handler —
  `AccessLevel.Write <= res.locals.access` — instead of re-querying.
- `hasScope(res, ...names)` — *credential-only* check: passes when the
  credential holds **one of** the named scopes, or when there is no
  restricting credential at all — so a session *and an anonymous request*
  both pass. Always pair it with an identity check; it is the idiom for
  "session-only" refinements inside handlers, e.g. OAuth consent requires
  `user && hasScope(res, "account:admin")`.
- `getAuthMethod(res)` — `"session" | "token" | null`, when a handler must
  distinguish credential types.
- `effectiveAccess(res, aclAccess)` — cap an ACL level by the credential for
  *display* (the scene "edit" button must not show for a read-only token).

---

## 7. Design invariants (don't break these)

1. **Sessions outrank tokens, structurally.** Only a session holds the
   non-mintable scopes; minting, consent and password/email changes all
   require one. Therefore a leaked token — any token — cannot create further
   credentials or outlive revocation.
2. **The ladder lives in `expand()` only.** Never hand-write "write implies
   read" logic; add scopes to `CONCRETE_SCOPES` and let expansion do it.
3. **Scope strings are never reinterpreted.** A new kind of operation ⇒ a new
   scope (or new family), never a changed meaning for an existing one.
4. **Scope before ACL.** A 403 for a narrow credential must be uniform,
   revealing nothing about the resource; existence-hiding (404) is the ACL
   layer's job.
5. **Identity is live, delegation is frozen.** Level changes apply on the next
   request; a token's scope never grows after minting.
6. **Anonymous ≠ empty.** Anonymous *account* scopes are `PUBLIC_SCOPES`
   (`scenes:read`), not `∅` — and never `corpus:read`. Its *credential* scopes
   are `null` (nothing presented, nothing restricted), like a session's.
