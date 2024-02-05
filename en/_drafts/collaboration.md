---
title: Making Smithsonian Voyager files collaborative
---

## Introduction

As any web-based tool, the Smithsonian Digitization Office's [Voyager Story](https://smithsonian.github.io/) editor is susceptible to being used in parallel by multiple peoples.

This is a problem when two people are editing the same file at the same time, as the last one to save will overwrite the other's changes. Nothing natively protects against this in the original architecture, because it's not something that seems to happen in the authors' pipeline.

However as we target learning environments more and more, it has become one of out main pain points.

In this document we will describe how multi-user collaboration could be implemented in Voyager and the steps taken to achieve it.


## Merging

The first step is to define what happens when two people edit the same file at the same time. Both will send the new version to the server. Then two things need to happen :

 a. The server has to detect that the file has been modified by someone else
 b. The server needs a way to merge the changes together

### Detecting changes

We need the server to know which version of the file the user think it is saving against. 

A simple way is to send some sort of [nonce](https://en.wikipedia.org/wiki/Cryptographic_nonce) or version ID with the file, that the client will send back when POSTing an update.

This way the server know which version the client wants to update against and can determine of a merge is needed.

This is a case of [optimistic concurrency control](https://en.wikipedia.org/wiki/Optimistic_concurrency_control). Several mechanisms can be used to provide the server with the version ID:

 - sending back the file's [ETag](https://en.wikipedia.org/wiki/HTTP_ETag) as an **If-Match** header with the PUT request
 - Injecting some invisible data in the file itself before sending it to the client. The client then unknowingly sends this data back to the server when PUTting the file.

The first option is clearly better for discoverability and practicity but requires more client-side code. Our implementation will use the second option as a proof of concept and should migrate to the first option in the future.

### Merging

[Merging]((https://en.wikipedia.org/wiki/Merge_(version_control))) is a complex problem, there will always be hypothetical cases where merging all changes is impossible, especially with a file format that wasn't primarily designed with collaboration in mind.

To simplify the problem down to manageable complexity, we decided to handle only the most common conflicts, while degrading to a simple overwrite when the merge is impossible. The main goal of this approach is to avoid scene corruption as much as possible, even if it means losing some changes. This loss wouldn't be irecoverable, as the lost version of the scene would still be available in the history.

Without going into too much details, we can break down our problem by file types :

 - text-based files (articles) can be merged using unstructured text merge algorithms. A simple *fuzzy patch* application can be enough to handle most changes.
 - binary files (models, images, sounds) will generally not be merged.
 - scene files should be merged structurally.
 
Text-based and binary files are pretty much straightforward, but scene files are more complex. We will describe the process in more details in the next section.

### A note on failure modes

It is typical for HTTP requests to fail with `412 Precondition Failed` for `If-Match` protected requests when a safe merge is not possible. However in our case, users have no way to recover from such an error without loosing all their changes.

We decided to degrade to a simple overwrite in this case. This is not ideal but it is the only way to avoid data loss. Meanwhile the overwritten version of the scene will still be available in the history.

#### Scene merging

The scene file is a JSON file that describes the scene. It is defined by a [JSON-schema](https://json-schema.org/): [document.schema.json](https://github.com/Smithsonian/dpo-voyager/blob/master/source/client/schema/json/document.schema.json) and a human-readable [documentation page](https://smithsonian.github.io/dpo-voyager/document/overview/).

To highlight why a text-based or even a deep-object-merge wouldn't be enough, let's take this simplified scene example:

```json
{
    "asset": { ... },
    "scene": 0,
    "scenes": [
        {
            "units": "cm",
            "name": "Scene",
            "nodes": [
                0,
            ],
            "meta": 0,
            "setup": 0
        }
    ],
    "nodes": [
        {
            "name": "ewer-base",
            "model": 0
        }
    ],
    "models": [...],
    "lights": [],
}
```

If Alice adds a new node -let's say, a Light- to this scene, he would then PUT this file:

```json
{
    "asset": { ... },
    "scene": 0,
    "scenes": [
        {
            "units": "cm",
            "name": "Scene",
            "nodes": [
                0,
                1
            ],
            "meta": 0,
            "setup": 0
        }
    ],
    "nodes": [
        {
            "name": "ewer-base",
            "model": 0
        }, {
            "name": "Key",
            "light": 0
        }
    ],
    "models": [...],
    "lights": [
      {
        "intensity": 1,
        "type": "directional",
      },
    ]

}
```

But meanwhile, Bob added a new light of type "point" to the scene, and PUT this file:

```json
{
    "asset": { ... },
    "scene": 0,
    "scenes": [
        {
            "units": "cm",
            "name": "Scene",
            "nodes": [
                0,
                1
            ],
            "meta": 0,
            "setup": 0
        }
    ],
    "nodes": [
        {
            "name": "ewer-base",
            "model": 0
        }, {
            "name": "Point",
            "light": 0
        }
    ],
    "models": [...],
    "lights": [
      {
        "intensity": 1,
        "type": "point",
      },
    ]

}
```

While the `lights` array is relatively easy to merge (but already an edge case to handle), we now have the scene's `nodes` array that *looks like* it's the same for both users. However our naive merge would result in only Alice's light being displayed in the scene. Bob's point light would still be defined but no longer present in the scene's tree.

The ideal merge result of the above operations would be:

```json
{
    "asset": { ... },
    "scene": 0,
    "scenes": [
        {
            "units": "cm",
            "name": "Scene",
            "nodes": [
                0,
                1,
                2
            ],
            "meta": 0,
            "setup": 0
        }
    ],
    "nodes": [
        {
            "name": "ewer-base",
            "model": 0
        }, {
            "name": "Key",
            "light": 0
        }, {
            "name": "Point",
            "light": 1
        }
    ],
    "models": [...],
    "lights": [
      {
        "intensity": 1,
        "type": "directional",
      },
      {
        "intensity": 1,
        "type": "point",
      },
    ]

}
```

This is not unheard of as structured merges (or [AST](https://en.wikipedia.org/wiki/Abstract_syntax_tree) merging) like this one are a common problem found in IT. In our case it is relatively simple as we only have indices that maps to objects to dereference. JavaScript objects are always referenced so we can simply dereference every indices, perform our diff and merge operations on this tree and then re-index it.


## Wrapping up

With a way to detect concurrent changes and a way to merge them, most collaboration use case would be covered. 

Real-world data is obviously going to surface more edge cases. However the application needs to be put to a point where collaboration is *good enough* to allow the gathering of data to improve the merge algorithm and handle those cases. The journalized nature of eCorpus allows us to be somewhat lax on data consistency, knowing we could always retrieve any saved file to manually put back the lost data.
