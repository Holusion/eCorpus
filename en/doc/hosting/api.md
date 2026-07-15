---
title: Using the API
rank: 4
---

## Using the API

eCorpus provides a comprehensive API that covers the needs of DPO Voyager while adding user management interfaces, access rights control, organization of scenes into collections, and more...

<div style="display:flex;justify-content:center">
    <a class="button" href="/en/doc/hosting/apiDoc">API Documentation</a>
</div>

### Authentication

> **Note:** HTTP *Basic* authentication with a username and password is **no longer supported** for API
> requests. The recommended way to authenticate a script or command-line client is now a **personal access
> token**, sent in the `Authorization` header as a Bearer token. See the [authentication guide](/en/doc/hosting/apiDoc#auth)
> in the API reference for the full picture (sessions, tokens, scopes and OAuth2).

Create a token from the web interface (or with `POST /auth/tokens` from a logged-in session), then use it as a
Bearer token:

```bash
curl -XGET -H "Authorization: Bearer ecorpus_xxxxxxxx" https://ecorpus.holusion.com/[...]
```

You can also open a browser-style session and reuse its cookie:

```bash
# Log in, saving the session cookie to a jar
curl -c cookies.txt -XPOST https://ecorpus.holusion.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"<username>","password":"<password>"}'

# Reuse the cookie on subsequent requests
curl -b cookies.txt -XGET https://ecorpus.holusion.com/[...]
```

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
curl -XGET -H "Authorization: Bearer ecorpus_xxxxxxxx" https://ecorpus.holusion.com/scenes/foo/models/foo.glb
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


### API REST

The API REST is documented via an [OpenAPI v3.1.0](https://spec.openapis.org/oas/v3.1.0) schema, which can be downloaded here: [openapi.yml](https://raw.githubusercontent.com/Holusion/eCorpus/gh_pages//_data/openapi.yml). The API is presented in a readable format on this site at the following page: [https://ecorpus.eu/en/doc/hosting/apiDoc.html](/en/doc/hosting/apiDoc).