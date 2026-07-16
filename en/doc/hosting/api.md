---
title: Using the API
rank: 4
---

## Using the API

eCorpus provides a comprehensive API that covers the needs of DPO Voyager while adding user management interfaces, access rights control, organization of scenes into collections, and more...


### Authentication

eCorpus has two distinct notions of authority that combine on every request:

- a server-wide **user level**, and
- a per-scene **access level**.

> **Note:** HTTP *Basic* authentication with a username and password was **dropped in eCorpus v0.3.0**.
> `Authorization: Basic …` is only used to authenticate a registered OAuth *client* on `POST /auth/oauth/token`.
> If your instance still runs **v0.2.x**, see the [legacy authentication guide](/en/doc/hosting/basic_auth).

#### User levels

Every account has exactly one level. They are ordered — a higher level includes the abilities of the lower ones:

| Level | Meaning |
| --- | --- |
| `none` | Not a real account. Anonymous/unauthenticated requests resolve to a synthetic `none`-level user with `uid` `0`. |
| `use` | Authenticated user. Can consume scenes they are granted access to, but cannot create scenes. |
| `create` | Default level of a newly-created account. Can create scenes. |
| `manage` | Can additionally manage groups. |
| `admin` | Instance administrator. Implicitly has `admin` access over **every** scene and can reach the `/admin` routes. |

#### Per-scene access levels

Independently of their level, a user is granted an access level over each scene, ordered
`none < read < write < admin`. The **effective** access on a scene is the *maximum* of:

- the user's explicit per-user grant (see [`PATCH /auth/access/{scene}`](/en/doc/hosting/apiDoc#patchaccess)),
- any grant inherited from a group the user belongs to,
- the scene's `default_access` (applies to any logged-in user; capped at `write`),
- the scene's `public_access` (applies to everyone including anonymous visitors; capped at `read`),
- the administrator override (`admin` users always get `admin`).

An anonymous visitor only ever gets a scene's `public_access`.

#### Authenticating a request

A request is identified, in order of precedence:

1. **Bearer token** — send `Authorization: Bearer ec_…`. Used by scripts, services and CLIs.
   A token that is presented but invalid/revoked is a hard `401` (it never silently falls back to anonymous).
2. **Session cookie** — the browser login path. The `session` cookie only carries an opaque session id;
   the identity (and the account's *current* level) is re-read server-side on every request, so logouts,
   password changes and level changes take effect immediately. Sessions last 31 days and auto-renew (sliding window).

Create a token from the web interface (or with `POST /auth/tokens` from a logged-in session), then use it as a
Bearer token:

```bash
curl -XGET -H "Authorization: Bearer ec_xxxxxxxx" https://ecorpus.holusion.com/[...]
```

You can also open a browser-style session and reuse its cookie, though that will create unrestricted access credentials stored as clear text on your disk:

```bash
# Log in, saving the session cookie to a jar
curl -c cookies.txt -XPOST https://ecorpus.holusion.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<username>","password":"<password>"}'

# Reuse the cookie on subsequent requests
curl -b cookies.txt -XGET https://ecorpus.holusion.com/[...]
```

#### Personal access tokens

A logged-in user mints a token with `POST /auth/tokens`, **from an interactive session only** — a token can
never create another token, even an `all`-scoped one. You choose a name, a set of *scopes* and an optional
expiry; the `ec_…` secret is returned **once** and never stored server-side. A token can never do more
than its owner's current level allows, and its scopes further cap it:

| Scope | Grants |
| --- | --- |
| `all` | Full authority. The only scope that passes level-based guards and account-management routes. |
| `scenes:read` / `scenes:write` / `scenes:admin` | Caps the *level* obtainable on scenes (visibility is unchanged). |
| `scenes:create` | Scene creation and archive import. |
| `tasks:read` / `tasks:write` | The `/tasks` API. |

List and revoke your tokens with `GET`/`DELETE /auth/tokens`. Anyone holding a token can revoke it through
`POST /auth/oauth/revoke`.

#### OAuth2 (authorization code + PKCE)

For third-party applications. An administrator registers a **client** (`POST /auth/oauth/clients`) with one or
more redirect URIs; *confidential* clients receive a secret, *public* clients (CLIs, SPAs) rely on
PKCE (Proof Key for Code Exchange) only.
The flow is a standard authorization-code grant with **mandatory PKCE (S256)**:

1. Send the user to `GET /auth/oauth/authorize` with `client_id`, an exact `redirect_uri`, `response_type=code`,
   an explicit `scope`, and a `code_challenge` (+`code_challenge_method=S256`).
2. The user logs in (a session is required) and approves on the consent page (`POST /auth/oauth/authorize`).
   The approval is persisted as a **grant**, so later requests covered by an existing grant are issued
   silently — convenient for renewals. `prompt=none` probes without UI, `prompt=consent` forces the page.
3. The app exchanges the single-use `code` at `POST /auth/oauth/token` with its `code_verifier`, receiving a
   30-day Bearer access token.

Users review the applications they approved with `GET /auth/oauth/grants` and revoke one with
`DELETE /auth/oauth/grants/{clientId}` — which also revokes every token that client holds for them. Server
metadata is discoverable at `/.well-known/oauth-authorization-server`.

#### Sessions & CSRF

Users list their active sessions (`GET /auth/sessions`) and revoke any by id; a password change evicts all of
an account's sessions. Unsafe methods on **cookie-authenticated** requests are protected against CSRF using
`Sec-Fetch-Site`/`Origin` checks; Bearer-token and anonymous requests are exempt (a header does not travel
cross-site on its own).

The individual `/auth` routes are documented in the [auth section of the API reference](/en/doc/hosting/apiDoc#auth).
For the design rationale behind this model (scope vocabulary, guard middleware, status-code contract), see the
[Identity & Access Control design document](/en/doc/hosting/development/auth_system).

### Scenes Organisation

Files orgnisation :

```
├── foo/
│   ├── scene.svx.json
│   ├── scene-image-thumb.jpg
│   ├── models/
│   │   └── foo.glb
│   └── articles/
│       └── foo-FR.html
└── bar/
    ├── scene.svx.json
    ├── scene-image-thumb.jpg
    ├── models/
    │   └── bar.glb
    └── articles/
        └── bar-FR.html
```

To retrieve a model:

```bash
curl -XGET -H "Authorization: Bearer ec_xxxxxxxx" https://ecorpus.holusion.com/scenes/foo/models/foo.glb
```

The verbs `GET` `PUT` `MOVE` `DELETE` `MKCOL` and `PROPFIND` are supported, with behavior generally conforming to the [specification](http://www.webdav.org/specs/rfc4918.html){:target="_blank"}. However, please note: This is a partial implementation of the specification (`COPY` and `LOCK`/`UNLOCK` are not implemented).


### Exporting data

Retreving a model :

```bash
curl -XGET -H "Authorization: Bearer ${TOKEN}" https://${HOSTNAME}/scenes/foo/models/foo.glb
```

Exporting one or more scene :

```bash
curl -XGET https://${HOSTNAME}/scenes?name=${NAME}&format=zip
```
You can add as many `name="..."` parameters as you need, separated by `&` characters.

### Importing data

Import zip scene or collection of scenes from a eCorpus instance.

```bash
curl -XPOST https://${HOSTNAME}/scenes --data-binary "@${ZIP_FILE}" -H "Authorization: Bearer ${TOKEN}" | jq .
```

The token must carry the `scenes:create` scope (or be `all`-scoped), and importing requires global **admin** rights.

The request returns a (potentially very large) JSON object describing the result. You can filter only failure by running `jq .fail` or if you don't have `jq` installed you can skip it and use the `curl -s --fail -o /dev/null -w "%{http_code}"`.


### REST API

The [REST](https://en.wikipedia.org/wiki/REST) API is documented via an [OpenAPI v3.2.0](https://spec.openapis.org/oas/v3.2.0) schema, which can be downloaded here: [openapi.yml](https://raw.githubusercontent.com/Holusion/eCorpus/gh_pages//_data/openapi.yml).

<div style="display:flex;justify-content:center">
    <a class="button" href="/en/doc/hosting/apiDoc">API Documentation</a>
</div>