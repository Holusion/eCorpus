---
title: Using of the API
---

## Use the API

eCorpus provides a comprehensive API that covers the needs of DPO Voyager while adding user management interfaces, access rights control, organization of scenes into collections, and more...

<div style="display:flex;justify-content:center">
    <a class="button" href="/en/doc/references/api">API Documentation</a>
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


### API REST

The API REST is documented via an [OpenAPI v3.1.0](https://spec.openapis.org/oas/v3.1.0) schema, which can be downloaded here: [openapi.yml](https://raw.githubusercontent.com/Holusion/eCorpus/gh_pages//_data/openapi.yml). The API is presented in a readable format on this site at the following page: [https://ecorpus.eu/en/doc/references/api](/en/doc/references/api).