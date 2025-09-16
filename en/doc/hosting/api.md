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

To authenticate via command line, use an `Authorization` header with the value `Basic <base64(username:password)>`.

The header encoding is handled automatically by most utilities. Example with curl:

```bash
curl -XGET -u "<username>:<password>" https://ecorpus.holusion.com/[...]
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
curl -XGET -u "<username>:<password>" https://ecorpus.holusion.com//scenes/foo/models/foo.glb
```

The verbs `GET` `PUT` `MOVE` `COPY` `DELETE` `MKCOL` and `PROPFIND` are supported, with behavior generally conforming to the [specification](http://www.webdav.org/specs/rfc4918.html){:target="_blank"}. However, please note: This is a partial implementation of the specification.


### Exporting data

Retreving a model :

```bash
curl -XGET -u "${USERNAME}:${PASSWORD}" https://${HOSTNAME}/scenes/foo/models/foo.glb
```

Exporting one or more scene :

```bash
curl -XGET https://${HOSTNAME}/scenes?name=${NAME}&format=zip
```
You can add as many `name="..."` parameters as you need, separated by `&` characters.

### Importing data

Import zip scene or collection of scenes from a eCorpus instance.

```bash
curl -XPOST https://${HOSTNAME}/scenes --data-binary "@${ZIP_FILE}" -u "${USERNAME}:${PASSWORD}" | jq .
```

Only user with global **admin** right can user this request.

The request returns a (potentially very large) JSON object describing the result. You can filter only failure by running `jq .fail` or if you don't have `jq` installed you can skip it and use the `curl -s --fail -o /dev/null -w "%{http_code}"`.


### API REST

The API REST is documented via an [OpenAPI v3.1.0](https://spec.openapis.org/oas/v3.1.0) schema, which can be downloaded here: [openapi.yml](https://raw.githubusercontent.com/Holusion/eCorpus/gh_pages//_data/openapi.yml). The API is presented in a readable format on this site at the following page: [https://ecorpus.eu/en/doc/hosting/apiDoc.html](/en/doc/hosting/apiDoc).