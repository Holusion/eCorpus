---
title: Using the API
---

## Using the API

eCorpus provides a two-part API:

 - webDAV on `/scenes/**` to access scene files.
 - REST on `/api/v1/**` for administrative management.

### Authentication

For command-line authentication, use an `Authorization` header with the value `Basic <base64(username:password)>`.

Header encoding is handled automatically by most utilities. Example with curl:

```bash
curl -XGET -u "<username>:<password>" https://ecorpus.holusion.com/[...]
```

### API webDAV

File organization:

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

So to retrieve a:

```bash
curl -XGET -u "<username>:<password>" https://ecorpus.holusion.com//scenes/foo/models/foo.glb
```

Les verbes `GET` `PUT` `MOVE` `COPY` `DELETE` `MKCOL` et `PROPFIND` sont supportés, avec un comportement se conformant généralement à la [spécification](http://www.webdav.org/specs/rfc4918.html){:target="_blank"}.


### API REST

The REST API can be accessed at `/api/v1/`. It uses standard HTTP verbs.

See the [route reference](/en/doc/references/api) for details.
