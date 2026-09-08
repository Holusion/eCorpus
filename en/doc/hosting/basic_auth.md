---
title: Authentication (eCorpus v0.2.x)
visible: false
---

# Authenticating on eCorpus v0.2.x

> **You are reading the legacy guide.** HTTP *Basic* authentication was **dropped in eCorpus v0.3.0**,
> replaced by personal access tokens and OAuth2. This page only applies to instances still running the
> **v0.2.x** stable line. For v0.3.0 and later, read the
> [current authentication guide](/en/doc/hosting/api#authentication).

## HTTP Basic authentication

In eCorpus v0.2.x, every API route accepts **HTTP Basic** credentials — your username and password, sent
with each request:

```bash
curl -u "<username>:<password>" https://ecorpus.holusion.com/scenes
```

Most HTTP clients support it natively (`https://user:password@host/…` URLs work too).

Keep in mind what this implies:

- your **actual password** travels with every request — only ever use it over HTTPS;
- a script's credential cannot be scoped down, and cannot be revoked short of changing the password.

These limitations are why Basic authentication was replaced with scoped, revocable tokens in v0.3.0.

## Browser-style sessions

The cookie session flow works the same as in later versions:

```bash
# Log in, saving the session cookie to a jar
curl -c cookies.txt -XPOST https://ecorpus.holusion.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<username>","password":"<password>"}'

# Reuse the cookie on subsequent requests
curl -b cookies.txt -XGET https://ecorpus.holusion.com/[...]
```

## What v0.2.x does not have

Personal access tokens (`/auth/tokens`), token scopes and the OAuth2 authorization server (`/auth/oauth/*`)
were all introduced in v0.3.0. On a v0.2.x instance, scripts and services authenticate with Basic
credentials or a session cookie — there is no other option.

The per-scene access levels (`none < read < write < admin`, including `default_access` and
`public_access`) already behave as described in the
[current guide](/en/doc/hosting/api#per-scene-access-levels).

The [API reference](/en/doc/hosting/apiDoc) on this site documents the **current** API; v0.2.x lacks the
`/auth/tokens`, `/auth/oauth/*`, `/auth/sessions`, `/groups`, `/tasks` and `/services` namespaces it
describes.
