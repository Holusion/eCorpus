---
title: API eCorpus
---

## API eCorpus

See [API user guide](/en/doc/guides/api).

All routes must be prefixed with `/api/v1/`.

Some routes require administration rights.

### /login

#### GET /login

#### POST /login

Authenticates a user.

#### GET /login/:username/link

Returns a login link for the user concerned in `text/plain` format.

Example content:
```text
https://irhis.ecorpus.holusion.com/api/v1/login?payload=[...]&redirect=%2F
```

#### GET /users

Returns the list of users in JSON format according to the following scheme:

```json
[
  {
    "uid": 280255476455992,
    "isAdministrator": false,
    "username": "jdupont",
    "email": "jean.dupont@example.com"
  }
]
```

#### POST /users

Create a user

The request body must be in `application/json` format. Example with curl:

```bash
curl -XPOST -H "Content-Type: application/json" -d "{\"username\":\"jdupont\", \"password\":\"some_secret_string\", \"isAdministrator\":false, \"email\":\"jean.dupont@example.com\"}" https://ecorpus.example.com/api/v1/users
```

the `username` property must satisfy the following regular expression: `/^[\w]{3,40}$/`.

#### DELETE /users/:uid

Deletes a user using its `uid`.

Requires administration rights.

#### PATCH /users/:uid

Changes one or more properties of a user using its `uid`.

Request body must be in `application/json` format. Same format as for user creation.

#### GET /scenes

The behavior differs according to the expected format (header `Accept`).

##### application/json

Retrieves the list of scenes in JSON format. More efficient than `PROPFIND /scenes`.

##### application/zip

Retrieves a zip of all the scenes in the instance.

#### POST /scenes
 > postScenes

```json
[
  {
    "name": "test",
    "author_id": 280255476455992,
    "author": "jdupont",
    "id": 36943841590670,
    "access": {
      "any": null,
      "default": "none"
    },
    "ctime": "2023-10-04T12:26:10.000Z",
    "mtime": "2023-10-04T12:26:11.000Z"
  }
]
```



#### POST /scenes/:scene

Create a scene. Wait for data in `multipart/form-data` format. The `scene` field must contain a file [glb](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#glb-file-format-specification).


#### PATCH /scenes/:scene

Rename a scene by sending a `name` field in the request body.

#### GET /scenes/:scene/history

Recovers the complete history of a scene.

#### POST /scenes/:scene/history

Modifies the history of a scene.

#### GET /scenes/:scene

The behavior differs according to the expected format (header `Accept`).

##### Application/json

Scene data in JSON format.

##### Application/zip

All the scene sources in their latest version in zip format.

#### GET /scenes/:scene/files

Lists the files in the scene.

#### GET /scenes/:scene/permissions

Lists scene permissions.

#### PATCH /scenes/:scene/permissions

Modifies scene permissions.



