---
title: Making Smithsonian Voyager files collaborative
tags: [dev]
---

As any web-based tool, the Smithsonian Digitization Office's [Voyager Story](https://smithsonian.github.io/) editor is susceptible to being used in parallel by multiple peoples. This becomes a problem when two people are editing the same file at the same time, as the last one to save will overwrite the other's changes.

 Nothing natively protects against this in the original architecture, because it's not something that seems to happen in the authors' pipeline.

However as we target learning environments more and more, it has become one of our most requested features.


This is the first part in a series of articles describing the work done to make the Smithsonian Voyager Story editor collaborative.

In this article we will describe the problem and the general approach we took to solve it. The next articles will describe the important technical aspects.

## Defining our goals

Collaboration is hard. Creating a "Multi-user environment" can mean a number of things depending on your use case. It is thus important to clearly define our collaboration goals before charging head-on into implementation details.

For our use case of a learning environment, we can define our goals as follows:

 - Users should be able to work on a scene file whenever they want, without having to wait for others to finish.
 - We dont care too much about data consistency because our database can always restore a previous version of any file.
 - We expect most of the changes to happen on the "tours", "annotations" and "articles". Other scene properties are not expected to change often, much less in parallel.

## A Brief overview

There is traditionally two ways to tackle client-side concurrency in web applications :

#### locking 

 > This is what **WebDAV** does.

This mechanism, often called "Pessimistic Locking** can have many minor variations but at its core :

 - A user informs the server he wishes to edit a resource by issuing a LOCK request.
 - The resource stays locked until the user issues an UNLOCK request or the lock expires.
 - Any user trying to edit a locked resource will not be able to commit changes until the lock is released.

This introduces a lot of edge cases and failure modes, which are handled in various ways by different standards and implementations. For example, locks can be mandatory (like in [RFC4918](https://datatracker.ietf.org/doc/html/rfc4918#section-7.2)), or advisory (like in [Wikipedia](https://en.wikipedia.org/wiki/Wikipedia:Edit_lock)).

The main limitation of a lock-based mechanism is that **it doesn't allow any concurrency**. It is just a mechanism to prevent conflicts from happening.

#### Reconciliation

 > This is what **Google Docs** does.

By chunking user actions into small operations, an algorithm can be made to reconcile changes regardless of the order in which they happened.

ie. Rebuild this:
```
A -> B
 \-> C
```
Into this:
```
A -> B -> C'
```

It is a focused-down variation of the three-way-merge[^1] algorithm used in version control systems like Git. 

This might allow as much concurrency as needed, depending on how good the merge algorithm is at handling conflicts or how much time you are willing to spend resolving them.

In the exploratory phase we wanted to find out just how far a purely automatic merge mechanism would get us, before exploring other options.


## Merging

Merging changes can be decomposed into two steps:

 - computing a "patch" that represents changes submitted by the user
 - Applying this patch to the current version of the file

### Detecting changes

We need the server to know which version of the file the user think it is saving against (a **parent**, in version-control language). Due to the journalized nature of **eCorpus**, this is not very hard to achieve : we are sure to have all file versions readily available on the server.

A simple way is to send some sort of [nonce](https://en.wikipedia.org/wiki/Cryptographic_nonce) or version ID with the file, that the client will send back when POSTing an update.

This way the server know which version the client wants to update against and can determine of a merge is needed.

This is a case of [optimistic concurrency control](https://en.wikipedia.org/wiki/Optimistic_concurrency_control). Several mechanisms can be used to provide the server with the version ID:

 - sending back the file's [ETag](https://en.wikipedia.org/wiki/HTTP_ETag) as an **If-Match** header with the PUT request
 - Injecting some invisible data in the file itself before sending it to the client. The client then unknowingly sends this data back to the server when PUTting the file.

The first option is clearly better for discoverability and practicity but requires more client-side code. Our implementation will use the second option as a proof of concept and should migrate to the first option in the future.

### Actually merging changes

[Merging](https://en.wikipedia.org/wiki/Merge_(version_control)) is a complex problem, there will always be hypothetical cases where merging all changes is impossible, especially with a file format that wasn't primarily designed with collaboration in mind.

To simplify the problem down to manageable complexity, we decided to handle only the most common conflicts, while degrading to a simple overwrite when the merge is impossible. The main goal of this approach is to avoid scene corruption as much as possible, even if it means losing some changes. This loss wouldn't be irecoverable, as the lost version of the scene would still be available in the history.

Without going into too much details, we can break down our problem by file types :

 - text-based files (articles) can be merged using unstructured text merge algorithms. A simple *fuzzy patch* application can be enough to handle most changes.
 - binary files (models, images, sounds) will generally not be merged.
 - scene files should be merged structurally.

One can readily see that scene files will be way more complex to merge properly : they contain a majority of the changes a user would submit and not only are they quite complex, they need to remain structurally coherent to be usable.

It is the major focus of out effort to bring collaboration to Voyager. We implemented a server-side abstraction layer to produce an intermediate representation of the scene from the user-submitted document as well as from the current scene version. We then compute and apply a patch from those representations. The result is finally serialized-back to a `.svx.json` scene file.

This ensures the computed scene should always remain structurally coherent and usable.

### A note on failure modes

It is typical for HTTP requests[^2] to fail with `412 Precondition Failed` for `If-Match` protected requests when a safe merge is not possible. However in our case, users have no way to recover from such an error without loosing all their changes.

We decided to degrade to a simple overwrite in this case. This is not ideal but it is the only way to avoid data loss. Meanwhile the overwritten version of the scene will still be available in the history.

### After the merge

Once the merge is done, the client needs to reconcile the new merged scene with what he has loaded. This could be trivially achieved by fully reloading the scene document. However this would trigger a trashing of all loaded nodes and freeze the scene for up to tens of seconds.

The source of nearly all the waiting time can be broken down to:
    
    - download the assets
    - transfer textures/geometries to the GPU

Due to the browser's cache being very efficient, asset files are generally already cached locally. But processing them still takes a lot of time.

To avoid this, we prototyped an internal cache of parsed `Object3D` that our models can reuse. This way, when a model is recreated it can reuse the cached `Object3D` instead of having to parse the file again. The renderer will detect that textures and geometries hasn't changed and will skip the transfer to the GPU.

## Wrapping up

With a way to detect concurrent changes and a way to merge them, most collaboration use case would be covered. 

Real-world data is obviously going to surface more edge cases. However the application needs to be put to a point where collaboration is *good enough* to allow the gathering of data to improve the merge algorithm and handle those cases. The journalized nature of eCorpus allows us to be somewhat lax on data consistency, knowing we could always retrieve any saved file to manually put back the lost data.

The following article will describe in more details how we managed to translate scene files into an abstract tree and the techniques we used to merge them. The final part in this series will describe how we implemented the Object-cache to speed up the scene reload.

[^1]: Smith, R.: GNU diff3
[^2]: rfc4918 section-12.2