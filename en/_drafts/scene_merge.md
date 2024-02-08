---
title: Structured merge of Voyager scene files
tags: [dev]
---

In this second part of our series on making the Smithsonian Voyager Story editor collaborative, we will describe the general approach we took to solve the problem of merging concurrent changes on scene files.

The scene file is a JSON file that describes the scene. It is defined by a [JSON-schema](https://json-schema.org/): [document.schema.json](https://github.com/Smithsonian/dpo-voyager/blob/master/source/client/schema/json/document.schema.json) and a human-readable [documentation page](https://smithsonian.github.io/dpo-voyager/document/overview/).

To highlight why a text-based or even a deep-object-merge wouldn't be enough, let's take this simplified scene example:

```json
{
    "asset": { /*...*/ },
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
    "models": [ /*...*/ ],
    "lights": [],
}
```

If Alice adds a new node —let's say, a *Light*— to this scene, he would then PUT this file:

```json
{
    "asset": { /*...*/ },
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
    "models": [ /*...*/ ],
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
    "asset": { /*...*/ },
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
    "models": [ /*...*/ ],
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
    "asset": { /*...*/ },
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
    "models": [ /*...*/ ],
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

How can we achieve this?

With a **structured merge** (or [Abstract Syntax Tree](https://en.wikipedia.org/wiki/Abstract_syntax_tree) merge). like this one are a common problem found in IT. 

In our case, most of the values are primitives (strings, numbers, booleans) or should be considered as such (arrays of coordinates, colors, etc). So only a fraction of the document needs to be parsed and translated to an abstract representation.

## Indices dereferencing

The simplest optimization we can do is to dereference every node that is indexed.

For example, every document has a `scene` property that points to the index of the active scene. This index is used to find the scene in the `scenes` array.

Our merge algorithm will simply dereference those indices, transforming this :

```js
{
  scene: 0,
  scenes:[
    {
      name: "Scene",
    }
  ]
}
```

into this:

```js
{
  scene: {
    name: "Scene",
  }
}
```

This way, we can perform our diff and merge operations on this tree and then re-index it.

## Array reduction

After the previous step, we still can't handle the above example: Both users added an item to the same array and we can't know what to do with them.

We need to remap the indices of the `nodes` array (as well as most other arrays in the document) to be able to uniquely identify their contents.

It is done by reducing the array to a map of unique keys. Fortunately the JSON-schema already defines a `id` property for most relevant array items. This key is unique within the array and can be used as a unique identifier. In places where an `id` is not available, we can use the node's name as a fallback.
