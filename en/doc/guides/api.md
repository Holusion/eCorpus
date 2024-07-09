---
title: Using the API
---

## Using the API

eCorpus provides a comprehensive API that build on DPO-Voyager's requirements.

### Authentication

For command-line authentication, use an `Authorization` header with the value `Basic <base64(username:password)>`.

Header encoding is handled automatically by most utilities. Example with curl:

```bash
curl -XGET -u "<username>:<password>" https://ecorpus.holusion.com/[...]
```

Get the full [API reference](/en/doc/references/api)

### /scenes API

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

`GET` `PUT` `MOVE` `COPY` `DELETE` `MKCOL` and `PROPFIND` methods are supported, with a behaviour that should conform to [RFC4918](http://www.webdav.org/specs/rfc4918.html){:target="_blank"}, but don't expect Class 2 or even Class 1 compliance.
